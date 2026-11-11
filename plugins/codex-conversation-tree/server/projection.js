export function projectTurns(threadId, turns) {
  return turns.filter(turn => turn.status === 'completed').map(turn => ({
    id: turn.id,
    threadId,
    status: turn.status,
    messages: (turn.items ?? [])
      .filter(item => item.type === 'userMessage' || item.type === 'agentMessage')
      .map(item => ({
        role: item.type === 'userMessage' ? 'user' : 'assistant',
        text: typeof item.text === 'string' ? item.text :
          Array.isArray(item.content) ? item.content.filter(part => part.type === 'text').map(part => part.text).join('\n') : ''
      })).filter(item => item.text),
    tools: (turn.items ?? [])
      .filter(item => ['commandExecution', 'fileChange', 'mcpToolCall', 'webSearch'].includes(item.type))
      .map(item => {
        if (item.type === 'commandExecution') return `命令 · ${item.command || '运行命令'}`;
        if (item.type === 'fileChange') return `文件修改 · ${(item.changes ?? []).map(change => change.path).filter(Boolean).join('、') || '查看详情'}`;
        if (item.type === 'mcpToolCall') return `工具 · ${item.server || 'MCP'} / ${item.tool || '调用'}`;
        return `网页搜索 · ${item.query || '查看详情'}`;
      })
  }));
}
