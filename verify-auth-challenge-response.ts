import {
  VerifyAuthChallengeResponseTriggerEvent,
  VerifyAuthChallengeResponseTriggerHandler,
  VerifyAuthChallengeResponseTriggerResult,
} from 'aws-lambda';

// 和之前版本一样的密码策略常量
const MIN_PASSWORD_LENGTH = 8;
const REQUIRE_LOWERCASE = true;
const REQUIRE_UPPERCASE = true;
const REQUIRE_NUMBERS = true;
const REQUIRE_SYMBOLS = true;

export const handler: VerifyAuthChallengeResponseTriggerHandler = async (
  event: VerifyAuthChallengeResponseTriggerEvent
): Promise<VerifyAuthChallengeResponseTriggerResult> => {
  console.log('Verify Auth Challenge Response Triggered:', JSON.stringify(event, null, 2));

  const { request, response } = event;
  const { privateChallengeParameters, challengeAnswer, userAttributes } = request;

  // challengeAnswer 是客户端通过 RespondToAuthChallenge API 发送的响应
  // 对于OTP，它可能是OTP字符串。对于密码重置，它是新密码字符串。
  // 客户端应该发送 { ANSWER: "value" }
  // 我们假设 challengeAnswer 就是这个 "value"
  const userAnswer = request.challengeAnswer; // The value client sent in "ANSWER"

  if (!privateChallengeParameters) {
      console.error('Missing privateChallengeParameters.');
      response.answerCorrect = false;
      return event;
  }

  // 检查是验证OTP还是验证密码
  if (privateChallengeParameters.otpCode) {
    // --- 验证邮件OTP ---
    console.log('Verifying EMAIL_OTP_STEP.');
    const expectedOtp = privateChallengeParameters.otpCode;
    if (userAnswer === expectedOtp) {
      console.log('OTP validation successful.');
      response.answerCorrect = true;
      // 不需要在这里设置challengeMetadata，DefineAuthChallenge会使用CreateAuthChallenge设置的元数据
    } else {
      console.log('OTP validation failed. Expected:', expectedOtp, 'Got:', userAnswer);
      response.answerCorrect = false;
    }
  } else if (privateChallengeParameters.usernameForValidation) {
    // --- 验证新密码 ---
    console.log('Verifying PASSWORD_RESET_STEP.');
    const newPassword = userAnswer;
    const usernameToValidate = privateChallengeParameters.usernameForValidation;

    if (!newPassword) {
      console.log('New password not provided.');
      response.answerCorrect = false;
      return event;
    }

    // 1. 校验密码是否包含用户名 (不区分大小写)
    if (newPassword.toLowerCase().includes(usernameToValidate.toLowerCase())) {
      console.log('Password validation failed: Password cannot contain the username.');
      response.answerCorrect = false;
      return event;
    }

    // 2. 校验 Cognito 的基本密码策略 (示例)
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      console.log(`Password validation failed: Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
      response.answerCorrect = false;
      return event;
    }
    if (REQUIRE_LOWERCASE && !/[a-z]/.test(newPassword)) {
      console.log('Password validation failed: Password must contain at least one lowercase letter.');
      response.answerCorrect = false;
      return event;
    }
    if (REQUIRE_UPPERCASE && !/[A-Z]/.test(newPassword)) {
      console.log('Password validation failed: Password must contain at least one uppercase letter.');
      response.answerCorrect = false;
      return event;
    }
    if (REQUIRE_NUMBERS && !/\d/.test(newPassword)) {
      console.log('Password validation failed: Password must contain at least one number.');
      response.answerCorrect = false;
      return event;
    }
    if (REQUIRE_SYMBOLS && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+/.test(newPassword)) {
      console.log('Password validation failed: Password must contain at least one symbol.');
      response.answerCorrect = false;
      return event;
    }

    // 如果所有密码校验通过
    console.log('Password validation successful.');
    response.answerCorrect = true;
  } else {
    // 未知的私有挑战参数
    console.error('Unknown private challenge parameters:', privateChallengeParameters);
    response.answerCorrect = false;
  }

  console.log('Verify Auth Challenge Response Result:', JSON.stringify(response, null, 2));
  return event;
};
