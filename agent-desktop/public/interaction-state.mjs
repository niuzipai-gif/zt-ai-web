export function shouldSubmitComposer({ key, shiftKey = false, isComposing = false, disabled = false } = {}) {
  return key === 'Enter' && !shiftKey && !isComposing && !disabled
}

export function authPresentation({ registering = false, pending = false } = {}) {
  if (pending) {
    return registering
      ? { button: '正在提交注册…', status: '注册申请已提交，请稍候…', busy: true }
      : { button: '正在验证账号…', status: '正在连接 ZT.AI 服务…', busy: true }
  }
  return registering
    ? { button: '注册并进入', status: '', busy: false }
    : { button: '登录', status: '', busy: false }
}
