import {
  CognitoUserPoolTriggerEvent,
  CognitoUserPoolTriggerHandler,
} from 'aws-lambda';

export const handler: CognitoUserPoolTriggerHandler = async (event) => {
  if (event.triggerSource !== 'DefineAuthChallenge_Authentication') {
    return event;
  }

  const session = event.request.session || [];

  // ── 阶段一：处理 SRP 握手后的 PASSWORD_VERIFIER
  // 当收到 SRP_A 完成（event.request.session = [{challengeName: 'SRP_A', challengeResult: true}]）时，
  // 明确下发 PASSWORD_VERIFIER，让 Cognito 做内置密码验证 :contentReference[oaicite:0]{index=0}
  if (
    session.length === 1 &&
    session[0].challengeName === 'SRP_A' &&
    session[0].challengeResult === true
  ) {
    event.response.issueTokens = false;
    event.response.failAuthentication = false;
    event.response.challengeName = 'PASSWORD_VERIFIER';
    return event;
  }

  // ── 阶段二：在 PASSWORD_VERIFIER 验证通过后，下发自定义挑战 CUSTOM_CHALLENGE
  if (
    session.length === 2 &&
    session[1].challengeName === 'PASSWORD_VERIFIER' &&
    session[1].challengeResult === true
  ) {
    event.response.issueTokens = false;
    event.response.failAuthentication = false;
    event.response.challengeName = 'CUSTOM_CHALLENGE';
    return event;
  }

  // ── 阶段三：自定义挑战通过，发放 Tokens
  if (session.some(
    (s) => s.challengeName === 'CUSTOM_CHALLENGE' && s.challengeResult === true
  )) {
    event.response.issueTokens = true;
    event.response.failAuthentication = false;
    return event;
  }

  // 自定义挑战失败超过 3 次，拒绝认证
  const fails = session.filter(
    (s) => s.challengeName === 'CUSTOM_CHALLENGE' && s.challengeResult === false
  );
  if (fails.length >= 3) {
    event.response.issueTokens = false;
    event.response.failAuthentication = true;
    return event;
  }

  // ── 其它情况（比如首次调用），启动 SRP_A 阶段
  event.response.issueTokens = false;
  event.response.failAuthentication = false;
  event.response.challengeName = 'SRP_A';
  return event;
};
