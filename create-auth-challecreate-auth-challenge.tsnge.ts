import {
  CreateAuthChallengeTriggerEvent,
  CreateAuthChallengeTriggerHandler,
  CreateAuthChallengeTriggerResult,
} from 'aws-lambda';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'; // AWS SDK v3

// 配置SES
const sesClient = new SESClient({ region: process.env.AWS_REGION || 'us-east-1' }); // 确保 Lambda 有 AWS_REGION 环境变量或硬编码
const FROM_EMAIL_ADDRESS = process.env.FROM_EMAIL_ADDRESS; // 从环境变量获取已验证的SES发件人邮箱

// 用来标识自定义挑战流程中的不同步骤的元数据
const EMAIL_OTP_STEP_METADATA = 'EMAIL_OTP_STEP';
const PASSWORD_RESET_STEP_METADATA = 'PASSWORD_RESET_STEP';

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 生成6位OTP
}

async function sendOtpViaEmail(email: string, otp: string): Promise<void> {
  if (!FROM_EMAIL_ADDRESS) {
    console.error('FROM_EMAIL_ADDRESS environment variable is not set.');
    throw new Error('Email configuration error.');
  }
  if (!email) {
    console.error('Recipient email is not provided.');
    throw new Error('Recipient email missing.');
  }

  const params = {
    Destination: { ToAddresses: [email] },
    Message: {
      Body: {
        Text: { Data: `Your verification code for password reset is: ${otp}` },
        Html: { Data: `Your verification code for password reset is: <b>${otp}</b>` },
      },
      Subject: { Data: 'Verification Code for Password Reset' },
    },
    Source: FROM_EMAIL_ADDRESS,
  };

  try {
    await sesClient.send(new SendEmailCommand(params));
    console.log(`OTP email sent to ${email}`);
  } catch (error) {
    console.error('Error sending OTP email:', error);
    throw error; // 抛出错误，Cognito会处理
  }
}

export const handler: CreateAuthChallengeTriggerHandler = async (
  event: CreateAuthChallengeTriggerEvent
): Promise<CreateAuthChallengeTriggerResult> => {
  console.log('Create Auth Challenge Triggered:', JSON.stringify(event, null, 2));

  const { request, response } = event;
  const { session, userAttributes, challengeName } = request;

  if (challengeName !== 'CUSTOM_CHALLENGE') {
    console.warn(`Unexpected challengeName: ${challengeName}. No action taken.`);
    return event;
  }

  let currentStepIsEmailOtp = true; // 默认为邮件OTP步骤

  // 判断当前应该是哪个步骤
  if (session && session.length > 0) {
    const lastChallenge = session[session.length - 1];
    // 如果上一个成功的自定义挑战是邮件OTP步骤，那么现在应该是密码重置步骤
    if (
      lastChallenge.challengeName === 'CUSTOM_CHALLENGE' &&
      lastChallenge.challengeResult === true &&
      lastChallenge.challengeMetadata === EMAIL_OTP_STEP_METADATA
    ) {
      currentStepIsEmailOtp = false;
    }
  }

  if (currentStepIsEmailOtp) {
    // --- 邮件OTP步骤 ---
    console.log('Creating challenge for EMAIL_OTP_STEP.');
    const email = userAttributes?.email;
    if (!email) {
      console.error('User email not found in attributes.');
      throw new Error('User email is required for OTP verification.');
    }

    const otp = generateOtp();
    await sendOtpViaEmail(email, otp); // 发送邮件

    response.publicChallengeParameters = {
      flowStep: 'EMAIL_OTP_VERIFICATION', // 告知客户端当前步骤
      emailDestination: email, // 可以部分显示邮箱，如 an***@example.com
    };
    response.privateChallengeParameters = {
      otpCode: otp, // 保存OTP用于验证
      email: email, // 保存邮箱用于记录或重发（如果需要）
    };
    response.challengeMetadata = EMAIL_OTP_STEP_METADATA; // 标记此挑战的类型
  } else {
    // --- 密码重置步骤 ---
    console.log('Creating challenge for PASSWORD_RESET_STEP.');
    const username = userAttributes ? userAttributes['cognito:username'] || userAttributes['username'] : undefined;
    if (!username) {
      console.error('Username not found in userAttributes for password reset step.');
      throw new Error('Username is required for password reset.');
    }

    response.publicChallengeParameters = {
      flowStep: 'PASSWORD_RESET_REQUIRED',
      username: username, // 传递给客户端用于前端校验提示
    };
    response.privateChallengeParameters = {
      // 保存用户名，Verify阶段会用到它来校验新密码是否包含用户名
      usernameForValidation: username,
    };
    response.challengeMetadata = PASSWORD_RESET_STEP_METADATA; // 标记此挑战的类型
  }

  console.log('Create Auth Challenge Response:', JSON.stringify(response, null, 2));
  return event;
};
