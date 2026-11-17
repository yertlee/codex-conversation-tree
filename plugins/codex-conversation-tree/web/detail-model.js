export function visibleMessages(messages = []) {
  const result = [];
  for (const message of messages) {
    if (!message || !['user', 'assistant'].includes(message.role)) continue;
    const text = String(message.text ?? '').trim();
    if (!text) continue;
    const previous = result[result.length - 1];
    if (previous?.role === message.role) previous.text += `\n\n${text}`;
    else result.push({ role: message.role, text });
  }
  return result;
}

