// Conversation state
let currentConversationId = null;
let chatHistory = [];

function setExample(text) {
  document.getElementById('userRequest').value = text;
}

function clearConversation() {
  currentConversationId = null;
  chatHistory = [];
  document.getElementById('conversationIndicator').classList.add('hidden');
  document.getElementById('chatHistory').classList.add('hidden');
  document.getElementById('chatHistory').innerHTML = '';
  document.getElementById('responseCard').classList.add('hidden');
  document.getElementById('userRequest').value = '';
  document.getElementById('userRequest').placeholder = 'e.g., Show me funny detective shows with Jim Carrey';
}

function addToChatHistory(role, message) {
  chatHistory.push({ role, message });
  const chatHistoryEl = document.getElementById('chatHistory');
  chatHistoryEl.classList.remove('hidden');

  const messageEl = document.createElement('div');
  messageEl.className = `chat-message ${role}`;
  messageEl.innerHTML = `<div class="chat-role">${role}</div><div>${message}</div>`;
  chatHistoryEl.appendChild(messageEl);
  chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
}

async function submitRequest(optionText = null) {
  const userRequest = optionText || document.getElementById('userRequest').value.trim();
  if (!userRequest) {
    alert('Please enter a search request');
    return;
  }

  const locale = document.getElementById('locale').value;
  const platform = document.getElementById('platform').value;
  const debug = document.getElementById('debug').checked;

  const submitBtn = document.getElementById('submitBtn');
  const loading = document.getElementById('loading');
  const responseCard = document.getElementById('responseCard');

  submitBtn.disabled = true;
  loading.classList.add('show');
  responseCard.classList.add('hidden');

  // Add user message to chat history
  addToChatHistory('user', userRequest);
  document.getElementById('userRequest').value = '';

  try {
    const startTime = performance.now();

    const requestBody = {
      user_request: userRequest,
      locale,
      platform,
      debug,
      request_id: crypto.randomUUID()
    };

    // Include conversation_id if we have one
    if (currentConversationId) {
      requestBody.conversation_id = currentConversationId;
    }

    const response = await fetch('/v1/search-normalization', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const endTime = performance.now();
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    // Update conversation ID
    currentConversationId = data.conversation_id;
    document.getElementById('conversationIdDisplay').textContent = currentConversationId.substring(0, 8) + '...';
    document.getElementById('conversationIndicator').classList.remove('hidden');

    // Add assistant message to chat history
    addToChatHistory('assistant', data.assistant_message);

    displayResponse(data, endTime - startTime);
  } catch (error) {
    displayError(error.message);
  } finally {
    submitBtn.disabled = false;
    loading.classList.remove('show');
  }
}

function displayResponse(data, clientTime) {
  const responseCard = document.getElementById('responseCard');
  
  const confidencePercent = Math.round(data.confidence * 100);
  const llmTime = data.debug?.timings_ms?.llm || '-';
  const totalTime = data.debug?.timings_ms?.total || '-';
  
  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
      <div>
        <span class="badge ${data.validation_status}">${data.validation_status.toUpperCase()}</span>
        <span class="badge ${data.intent}" style="margin-left:8px;">${data.intent.toUpperCase()}</span>
      </div>
      <div style="color:#888;font-size:12px;">
        LLM: ${llmTime}ms | Total: ${totalTime}ms | Client: ${Math.round(clientTime)}ms
      </div>
    </div>
    
    <div class="result-grid">
      <div class="result-item" style="grid-column: span 2;">
        <div class="result-label">Search Term</div>
        <div class="result-value search-term">${data.search_term || '(none - clarification needed)'}</div>
      </div>

      ${data.fallback_terms && data.fallback_terms.length > 0 ? `
      <div class="result-item" style="grid-column: span 2;">
        <div class="result-label">Fallback Terms (if primary returns no results)</div>
        <div class="result-value" style="color:#00d9ff;">
          ${data.fallback_terms.map((term, i) => `<span style="background:rgba(0,217,255,0.2);padding:4px 8px;border-radius:4px;margin-right:8px;">${i+1}. ${term}</span>`).join('')}
        </div>
      </div>
      ` : ''}

      <div class="result-item" style="grid-column: span 2;">
        <div class="result-label">${data.needs_clarification ? 'Clarification Message' : 'Assistant Message'}</div>
        <div class="result-value message" style="color:${data.needs_clarification ? '#ff6b6b' : '#ffcc00'};">"${data.needs_clarification && data.clarification_question ? data.clarification_question : data.assistant_message}"</div>
      </div>

      <div class="result-item">
        <div class="result-label">Confidence</div>
        <div class="result-value">${confidencePercent}%</div>
        <div class="confidence-bar">
          <div class="confidence-fill" style="width:${confidencePercent}%"></div>
        </div>
      </div>

      <div class="result-item">
        <div class="result-label">Needs Clarification</div>
        <div class="result-value">${data.needs_clarification ? '⚠️ Yes' : '✅ No'}</div>
      </div>
  `;

  // Show clarification type if available
  if (data.needs_clarification && data.clarification_type) {
    html += `
      <div class="result-item">
        <div class="result-label">Clarification Type</div>
        <div class="result-value">${data.clarification_type}</div>
      </div>
    `;
  }

  // Show clarification options as buttons
  if (data.needs_clarification && data.clarification_options && data.clarification_options.length > 0) {
    html += `
      <div class="result-item" style="grid-column: span 2;">
        <div class="result-label">Quick Reply Options</div>
        <div class="clarification-options">
          ${data.clarification_options.map(opt =>
            `<button class="clarification-btn" onclick="submitRequest('${opt.replace(/'/g, "\\'")}')">${opt}</button>`
          ).join('')}
        </div>
      </div>
    `;
  }

  html += '</div>';

  // Update input placeholder if clarification is needed
  if (data.needs_clarification) {
    document.getElementById('userRequest').placeholder = 'Type your answer or click an option above...';
  } else {
    document.getElementById('userRequest').placeholder = 'e.g., Show me funny detective shows with Jim Carrey';
  }

  if (data.debug) {
    html += `
      <div class="debug-section">
        <button class="debug-toggle" onclick="toggleDebug()">📊 Toggle Debug Info</button>
        <pre id="debugPre" class="hidden">${JSON.stringify(data.debug, null, 2)}</pre>
      </div>
    `;
  }

  html += `
    <div style="margin-top:20px;">
      <div class="result-label">Full Response</div>
      <pre>${JSON.stringify(data, null, 2)}</pre>
    </div>
  `;
  
  responseCard.innerHTML = html;
  responseCard.classList.remove('hidden');
}

function displayError(message) {
  const responseCard = document.getElementById('responseCard');
  responseCard.innerHTML = `<div class="error"><strong>Error:</strong> ${message}</div>`;
  responseCard.classList.remove('hidden');
}

function toggleDebug() {
  const debugPre = document.getElementById('debugPre');
  debugPre.classList.toggle('hidden');
}

// Allow Enter key to submit
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('userRequest').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitRequest();
    }
  });
});

