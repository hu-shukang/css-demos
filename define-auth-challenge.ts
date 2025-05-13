import {
  DefineAuthChallengeTriggerEvent,
  DefineAuthChallengeTriggerHandler,
  DefineAuthChallengeTriggerResult,
} from 'aws-lambda';

const EMAIL_OTP_STEP_METADATA = 'EMAIL_OTP_STEP';
const PASSWORD_RESET_STEP_METADATA = 'PASSWORD_RESET_STEP';

export const handler: DefineAuthChallengeTriggerHandler = async (
  event: DefineAuthChallengeTriggerEvent
): Promise<DefineAuthChallengeTriggerResult> => {
  console.log('Define Auth Challenge Triggered:', JSON.stringify(event, null, 2));

  const { request, response } = event;
  const { session, userNotFound, userAttributes } = request;

  if (userNotFound) {
    console.log('User not found.');
    response.issueTokens = false;
    response.failAuthentication = true;
    return event;
  }

  const isForceChangePassword = userAttributes && userAttributes['cognito:user_status'] === 'FORCE_CHANGE_PASSWORD';

  if (session && session.length > 0) {
    const lastChallenge = session[session.length - 1];

    // 拦截点：当Cognito准备进入 PASSWORD_VERIFIER 阶段时，
    // 如果用户需要强制重置密码，则转到我们的自定义流程。
    if (lastChallenge.challengeName === 'PASSWORD_VERIFIER' && isForceChangePassword) {
      console.log('PASSWORD_VERIFIER challenge, but user is FORCE_CHANGE_PASSWORD. Redirecting to CUSTOM_CHALLENGE for EMAIL_OTP_STEP.');
      response.issueTokens = false;
      response.failAuthentication = false;
      response.challengeName = 'CUSTOM_CHALLENGE'; // 开始我们的OTP流程
    }
    // 如果正在进行我们的 CUSTOM_CHALLENGE 流程
    else if (lastChallenge.challengeName === 'CUSTOM_CHALLENGE') {
      if (lastChallenge.challengeResult === true) { // 上一个自定义挑战成功
        if (lastChallenge.challengeMetadata === EMAIL_OTP_STEP_METADATA) {
          console.log('EMAIL_OTP_STEP successful. Issuing CUSTOM_CHALLENGE for PASSWORD_RESET_STEP.');
          response.issueTokens = false;
          response.failAuthentication = false;
          response.challengeName = 'CUSTOM_CHALLENGE';
        } else if (lastChallenge.challengeMetadata === PASSWORD_RESET_STEP_METADATA) {
          console.log('PASSWORD_RESET_STEP successful. Issuing tokens.');
          response.issueTokens = true;
          response.failAuthentication = false;
        } else {
          console.warn('Unknown successful CUSTOM_CHALLENGE metadata:', lastChallenge.challengeMetadata);
          response.failAuthentication = true;
          response.issueTokens = false;
        }
      } else { // 上一个自定义挑战失败
        console.log('Previous CUSTOM_CHALLENGE failed.');
        response.failAuthentication = true;
        response.issueTokens = false;
      }
    }
    // 对于 SRP_A 阶段，或者其他不由我们 FORCE_CHANGE_PASSWORD 逻辑处理的阶段，
    // 让 Cognito 默认行为继续。
    // 如果是 SRP_A，Cognito会期望客户端响应，然后可能会再次调用 DefineAuthChallenge 进入 PASSWORD_VERIFIER。
    // 如果是 PASSWORD_VERIFIER 且用户不是 FORCE_CHANGE_PASSWORD，则 Cognito 会验证密码。
    else if (lastChallenge.challengeName === 'SRP_A') {
        console.log('SRP_A challenge. Allowing Cognito to proceed with SRP.');
        // 不需要修改 response，Cognito会等待客户端响应SRP_A
        // response.issueTokens = false; // (Cognito 默认)
        // response.failAuthentication = false; // (Cognito 默认)
        // response.challengeName = 'SRP_A'; // (Cognito 默认)
    } else if (lastChallenge.challengeName === 'PASSWORD_VERIFIER' && !isForceChangePassword && lastChallenge.challengeResult === true) {
        // 标准SRP登录成功完成 (用户提供了正确的密码，且不是强制修改密码)
        console.log('Standard SRP (PASSWORD_VERIFIER) successful. Issuing tokens.');
        response.issueTokens = true;
        response.failAuthentication = false;
    } else if (lastChallenge.challengeName === 'PASSWORD_VERIFIER' && !isForceChangePassword && lastChallenge.challengeResult === false) {
        console.log('Standard SRP (PASSWORD_VERIFIER) failed.');
        response.failAuthentication = true;
        response.issueTokens = false;
    }
    // 考虑 Cognito 可能会直接提出 NEW_PASSWORD_REQUIRED 如果它检测到 FORCE_CHANGE_PASSWORD 状态
    // 即使我们用了 CUSTOM_WITH_SRP
    else if (lastChallenge.challengeName === 'NEW_PASSWORD_REQUIRED' && isForceChangePassword) {
        console.log('NEW_PASSWORD_REQUIRED challenge by Cognito, but user is FORCE_CHANGE_PASSWORD. Redirecting to CUSTOM_CHALLENGE for EMAIL_OTP_STEP.');
        response.issueTokens = false;
        response.failAuthentication = false;
        response.challengeName = 'CUSTOM_CHALLENGE';
    }
    else {
      console.log(`Unhandled session challenge: ${lastChallenge.challengeName}. Letting Cognito decide or failing.`);
      // 如果是其他未明确处理的挑战，并且我们没有特定的逻辑，可以让 Cognito 的决定生效，或者明确失败。
      // 为了安全起见，如果不是我们明确允许的路径，可以考虑失败。
      // 但这里要小心，不要干扰不相关的 Cognito 流程。
      // 如果没有上述 if/else if 覆盖，这里的 response 维持 Cognito 之前的决定。
      // 如果 Cognito 认为应该失败，它会设置 failAuthentication=true。
      // 如果它想继续另一个挑战，它会设置 challengeName。
      // 我们主要确保的是，如果 isForceChangePassword，最终会走到我们的 CUSTOM_CHALLENGE。
    }
  }
  // 初始请求，session 为空 (通常在 USER_SRP_AUTH 或 CUSTOM_WITH_SRP 流程中，session 会有 SRP_A)
  // 但如果某些配置或错误导致 session 为空，并且用户需要重置密码：
  else if ((!session || session.length === 0) && isForceChangePassword) {
    console.log('No session OR initial call and user is FORCE_CHANGE_PASSWORD. Issuing CUSTOM_CHALLENGE for EMAIL_OTP_STEP.');
    // 这种情况，如果客户端用的是 CUSTOM_WITH_SRP，通常DefineAuthChallenge第一次被调用时，session已经有SRP_A了。
    // 但为了覆盖边缘情况，或者如果authFlowType是纯 CUSTOM_AUTH：
    response.issueTokens = false;
    response.failAuthentication = false;
    response.challengeName = 'CUSTOM_CHALLENGE';
  }
  // 初始请求，session 为空，非强制修改密码：让 Cognito 默认 SRP 流程开始
  else if ((!session || session.length === 0) && !isForceChangePassword) {
      console.log('No session OR initial call, not FORCE_CHANGE_PASSWORD. Allowing Cognito default SRP flow.');
      // 不需要修改 response，Cognito 会继续其默认流程 (例如，客户端会收到 SRP_A 挑战，如果它发起的是 SRP)
  } else {
      console.log('Unhandled define auth state (e.g., session might be present but not matching any logic and not FORCE_CHANGE_PASSWORD). Failing.');
      response.issueTokens = false;
      response.failAuthentication = true;
  }

  console.log('Define Auth Challenge Response:', JSON.stringify(response, null, 2));
  return event;
};
