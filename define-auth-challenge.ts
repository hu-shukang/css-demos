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

  // 检查用户是否处于强制修改密码状态
  const isForceChangePassword = userAttributes && userAttributes['cognito:user_status'] === 'FORCE_CHANGE_PASSWORD';

  // 初始登录尝试 (可能是SRP_A，也可能是空的session，取决于配置)
  // 或者，用户正在进行我们的自定义挑战流程
  if (session && session.length > 0) {
    const lastChallenge = session[session.length - 1];

    // 情况1: SRP 流程开始，但用户需要强制密码重置
    if (lastChallenge.challengeName === 'SRP_A' && isForceChangePassword) {
      console.log('SRP_A challenge, but user is FORCE_CHANGE_PASSWORD. Redirecting to CUSTOM_CHALLENGE for EMAIL_OTP_STEP.');
      response.issueTokens = false;
      response.failAuthentication = false;
      response.challengeName = 'CUSTOM_CHALLENGE'; // 开始我们的OTP流程
    }
    // 情况2: 正在进行我们的 CUSTOM_CHALLENGE 流程
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
    // 情况3: 其他Cognito内置挑战（例如，PASSWORD_VERIFIER 完成SRP, NEW_PASSWORD_REQUIRED等）
    // 如果我们想完全覆盖 FORCE_CHANGE_PASSWORD，需要确保不让 Cognito 默认处理它
    else if (isForceChangePassword) {
        // 如果 Cognito 尝试了其他挑战（如 NEW_PASSWORD_REQUIRED），但我们想用自定义流程
        console.log(`User is FORCE_CHANGE_PASSWORD, but current challenge is ${lastChallenge.challengeName}. Intercepting for CUSTOM_CHALLENGE (EMAIL_OTP).`);
        response.issueTokens = false;
        response.failAuthentication = false;
        response.challengeName = 'CUSTOM_CHALLENGE';
    }
    // 其他情况，让Cognito默认处理或失败 (取决于你的整体策略)
    else {
      console.log(`Unhandled session challenge: ${lastChallenge.challengeName}. Defaulting to Cognito behavior or failing.`);
      // 如果不是强制重置密码，并且不是我们的自定义挑战，那么可能是标准的SRP登录流程完成
      // 例如，如果 lastChallenge.challengeName 是 'PASSWORD_VERIFIER' 并且 challengeResult 是 true
      if (lastChallenge.challengeName === 'PASSWORD_VERIFIER' && lastChallenge.challengeResult === true && !isForceChangePassword) {
          console.log('Standard SRP password verification successful. Issuing tokens.');
          response.issueTokens = true;
          response.failAuthentication = false;
      } else if (lastChallenge.challengeName !== 'PASSWORD_VERIFIER' || lastChallenge.challengeResult === false) {
          // 如果不是成功的 PASSWORD_VERIFIER，或者其他未处理的挑战，则失败
          console.log('Standard flow did not complete successfully or unhandled challenge. Failing authentication.');
          response.failAuthentication = true;
          response.issueTokens = false;
      }
      // 如果没有上面的 if/else if 覆盖，这里的 response 维持 Cognito 之前的决定
    }
  }
  // 初始请求，session 为空 (如果 authFlowType 不是 USER_SRP_AUTH 或 CUSTOM_WITH_SRP，而是纯 CUSTOM_AUTH)
  else if ((!session || session.length === 0) && isForceChangePassword) {
    console.log('No session and user is FORCE_CHANGE_PASSWORD. Issuing CUSTOM_CHALLENGE for EMAIL_OTP_STEP.');
    response.issueTokens = false;
    response.failAuthentication = false;
    response.challengeName = 'CUSTOM_CHALLENGE';
  }
  // 对于非强制修改密码的初始登录（例如，标准SRP登录，session为空）
  // Cognito 会自动处理，Define Auth Challenge 可能不需要特别做什么，除非你想改变默认行为。
  // 如果 session 为空且不是 FORCE_CHANGE_PASSWORD，Cognito 会尝试 SRP_A (如果客户端用 SRP 方式)
  // 此时，Define Auth Challenge 的 response 应该不设置 challengeName，或者明确设置为 'SRP_A' (虽然通常不需要)
  // Cognito 的默认行为会处理 SRP_A -> PASSWORD_VERIFIER。
  // 我们主要关注的是如何将 FORCE_CHANGE_PASSWORD 用户拉入我们的自定义流程。
  else if ((!session || session.length === 0) && !isForceChangePassword) {
      console.log('No session, not FORCE_CHANGE_PASSWORD. Allowing Cognito default SRP flow.');
      // 不需要修改 response，Cognito 会继续其默认流程 (例如，发起 SRP_A)
      // response.issueTokens = false; // 默认
      // response.failAuthentication = false; // 默认
  } else {
      console.log('Unhandled define auth state. Failing.');
      response.issueTokens = false;
      response.failAuthentication = true;
  }

  console.log('Define Auth Challenge Response:', JSON.stringify(response, null, 2));
  return event;
};
