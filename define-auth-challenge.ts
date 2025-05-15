// amplify/auth/define-auth-challenge.ts
import type { DefineAuthChallengeTriggerHandler } from 'aws-lambda';

export const handler: DefineAuthChallengeTriggerHandler = async (event) => {
  console.log('Define Auth Challenge Trigger:', JSON.stringify(event, null, 2));

  if (event.request.userNotFound) {
    event.response.issueTokens = false;
    event.response.failAuthentication = true;
    console.log('User not found.');
    return event;
  }

  const needsInitialSetup = event.request.userAttributes['custom:needs_initial_setup'] === 'true';

  // 新的登录尝试
  if (!event.request.session || event.request.session.length === 0) {
    if (needsInitialSetup) {
      console.log('User needs initial setup. Issuing CUSTOM_CHALLENGE.');
      event.response.challengeName = 'CUSTOM_CHALLENGE';
      event.response.issueTokens = false;
      event.response.failAuthentication = false;
    } else {
      // 已经设置过的用户，走标准密码验证 (SRP)
      console.log('User already set up. Issuing SRP_A challenge.');
      event.response.challengeName = 'SRP_A'; // 或者 PASSWORD_VERIFIER 如果你想用 USER_PASSWORD_AUTH
      event.response.issueTokens = false;
      event.response.failAuthentication = false;
    }
  } else {
    // 用户已经响应过挑战
    const previousChallenge = event.request.session[event.request.session.length - 1];
    const { challengeName, challengeResult } = previousChallenge;

    if (challengeName === 'CUSTOM_CHALLENGE' && challengeResult === true) {
      console.log('Custom challenge successful. Issuing tokens.');
      event.response.issueTokens = true;
      event.response.failAuthentication = false;
      // 可选：在这里更新 userAttributes，例如将 custom:needs_initial_setup 设置为 false
      // 注意：直接在这里更新属性可能不是最佳实践，通常在 Verify Auth Challenge 成功后操作
    } else if (challengeName === 'SRP_A' || challengeName === 'PASSWORD_VERIFIER') {
       // 如果是标准流程，Cognito 会处理，这里通常不需要特殊逻辑，除非你想介入
       // 但在此场景下，我们关注的是 CUSTOM_CHALLENGE 后的流程
       // 如果 CUSTOM_CHALLENGE 成功了，我们上面已经 issueTokens = true 了
       // 如果标准流程到这里，说明是常规登录或 CUSTOM_CHALLENGE 后的密码验证（如果你的流程如此设计）
       // 此时如果 SRP/PASSWORD_VERIFIER 验证成功，Cognito 会自动颁发令牌
       // 因此，如果前面的 CUSTOM_CHALLENGE 没成功，或者这是常规登录的第一步，Cognito会处理
       // 若我们希望在 CUSTOM_CHALLENGE 成功后直接发令牌，则上面那段逻辑已覆盖
       // 若CUSTOM_CHALLENGE后还需密码验证，则流程会更复杂，这里假设CUSTOM_CHALLENGE成功即登录
       event.response.issueTokens = false; // Cognito 会根据 PASSWORD_VERIFIER 的结果决定是否 issue
       event.response.failAuthentication = false; // Cognito 会判断
    } else {
      console.log('Challenge failed or unknown state. Failing authentication.');
      event.response.issueTokens = false;
      event.response.failAuthentication = true;
    }
  }
  console.log('Returning event:', JSON.stringify(event, null, 2));
  return event;
};
