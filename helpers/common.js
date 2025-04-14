import axios from 'axios';

import { SLACK_CHANNEL, PASS_MIGRATIONS_CHANNEL } from '../constants.js';

const { userEmail, platform, NODE_ENV  } = process.env;

export const sleep = (secs = 1) => new Promise((resolve) => {
  setTimeout(resolve, secs * 1000);
});

export const parseProxyUrl = (url) => {
  const regex = /^http:\/\/([^:]+):(\d+)@([^:]+):([^/]+)$/;
  const match = url.match(regex);

  if (match) {
    const [, host, port, username, password] = match;
    return {
      host,
      port,
      username,
      password
    };
  } else {
    console.log('Invalid proxy URL format');
  }
};

export const generateGUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export const getCookies = ({ cookies }) => {
  let cookieMerge = '';
  const cookieList = [];
  for (let i = 0; i < cookies.length; i += 1) {
    if (cookies[i].name !== 'sst-main') {
      const { name } = cookies[i];
      const { value } = cookies[i];
      cookieMerge = `${name}=${value}`;
      cookieList.push(cookieMerge);
    }
  }
  return cookieList.join(';');
};

export const sendNotificationOnSlack = async ({
  errorMessage,
  task
}) => {
  try {
    let url = SLACK_CHANNEL;
    if (NODE_ENV === 'production') {
      url = PASS_MIGRATIONS_CHANNEL;
    }
    console.log('error message', errorMessage);
    const maxLength = 3000;
    const truncatedMessage =
      errorMessage.length > maxLength
        ? `${errorMessage.slice(0, maxLength)}\n\n... (truncated)`
        : errorMessage;
  
    console.log({
      truncatedMessage
    });
    const body = `
        (Msg through Automation) \n
        Task: ${task}
        Account: ${userEmail},
        Platform: '${platform}'
        Error: ${truncatedMessage}
      `;
  
    await axios.post(url, {
      text: body
    });
  
    return true;
  } catch (err) {
    console.log('Unable to Send Slack Hook!');
  }
};

export const loginMethod = async ({
  page,
  email,
  password,
  retries = 3
}) => {
  try {
    const emailSelector = await page.$('input[type=email]');

    console.log({ emailSelector });
  
    await emailSelector.click();
    await emailSelector.click({ clickCount: 3 });
    await emailSelector.press('Backspace');
  
    await emailSelector.type(email, { delay: 300 });
    await sleep(10);
  
    const continueButton1 = await page.$('::-p-xpath(//button[@type="submit"])');
    console.log({ continueButton1 });
  
    const continueButton = await page.$('button[type=submit]')
  
    await continueButton.click();
    await sleep(10);
    const passwordSelector = await page.$('input[placeholder="Password"]');
    await passwordSelector.type(password, { delay: 300 });
  
    await sleep(10);
  
    const loginButton = await page.$('::-p-xpath(//button[text()="Login"])')
    await loginButton.click();
  
    await sleep(30);
  
    console.log('button clicked')
    await sleep(10);
  } catch (err) {
    console.log('Error in loginMethod', err);
    if (retries > 0) {
      await page.reload();
      await loginMethod({
        page,
        email,
        password,
        retries: retries - 1
      });
    } else throw new Error('LOGIN FAILED!');
  }
};

export const loginCsTool = async ({
  page,
  email,
  password,
  retries = 3
}) => {
  try {
    await sleep(30);
    const emailSelector = await page.$('input[type=email]', { visible: true });

    console.log({ emailSelector });

    const emailText = await emailSelector.evaluate(el => el.textContent);
    console.log({ emailText });
  
    await emailSelector.click();
    await emailSelector.click({ clickCount: 3 });
    await emailSelector.press('Backspace');
  
    await emailSelector.type(email, { delay: 300 });
    await sleep(10);
  
    const continueButton1 = await page.$('::-p-xpath(//button[@type="submit"])');
    console.log({ continueButton1 });
  
    const continueButton = await page.$('button[type=submit]')
  
    await continueButton.click();
    await sleep(10);
    const passwordSelector = await page.$('input[type=password]');
    await passwordSelector.type(password, { delay: 300 });
  
    await sleep(10);
  
    const loginButton = await page.$('::-p-xpath(//button[text()="Login"])')
    await loginButton.click();
  
    await sleep(30);
  
    console.log('button clicked')
    await sleep(10);
  } catch (err) {
    console.log('Error in loginMethod', err);
    if (retries > 0) {
      await page.reload();
      await loginMethod({
        page,
        email,
        password,
        retries: retries - 1
      });
    } else throw new Error('LOGIN FAILED!');
  }
};

export const loginToShootProof = async ({
  page,
  email,
  password,
  retries = 3
}) => {
  try {
    console.log({
      email,
      password
    })
    const emailSelector = await page.$('#email');

    console.log({ emailSelector });
  
    await emailSelector.click();
    await emailSelector.click({ clickCount: 3 });
    await emailSelector.press('Backspace');
  
    await emailSelector.type(email, { delay: 300 });
    await sleep(10);
  
    const passwordSelector = await page.$('#password');
    await passwordSelector.type(password, { delay: 300 });
    console.log({
      passwordSelector
    });
  
    await sleep(10);

    const loginButton = await page.$('input[type=submit]')
  
    await loginButton.click();
  
    await sleep(30);
  
    console.log('button clicked')
    await sleep(10);
  } catch (err) {
    console.log('Error in loginMethod', err);
    if (retries > 0) {
      await page.reload();
      await loginToShootProof({
        page,
        email,
        password,
        retries: retries - 1
      });
    } else throw new Error('LOGIN FAILED!');
  }
};

export const loginToZenFolio = async ({
  page,
  email,
  password,
  retries = 3
}) => {
  try {
    console.log({ email, password });

    const emailSelector = await page.$('#email');
    console.log({ emailSelector });

    await emailSelector.click();
    await emailSelector.click({ clickCount: 3 });
    await emailSelector.press('Backspace');
    await emailSelector.type(email, { delay: 300 });
  
    await sleep(10);
  
    const passwordSelector = await page.$('#password');
    await passwordSelector.type(password, { delay: 300 });

    console.log({ passwordSelector });

    console.log("Email and password filled");
  
    await sleep(10);

    const loginButton = page.locator('button', { hasText: 'Log in' });

    await loginButton.click();
  
    console.log('Button clicked, logging in...');
  
    await sleep(10);
  } catch (err) {
    console.error('Error in loginToZenFolio', err);
    if (retries > 0) {
      await page.reload();
      await loginToZenFolio({
        page,
        email,
        password,
        retries: retries - 1
      });
    } else {
      throw new Error('LOGIN FAILED!');
    }
  }
};

export const encryptPassword = (password) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(HASHING_ALGORITHM, SECRET_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(password), cipher.final()]);
  return {
    iv: iv.toString('hex'),
    content: encrypted.toString('hex')
  };
};

export const pixiesetLoginMethod = async ({
  page,
  email,
  password,
  retries = 3
}) => {
  try {
    const emailSelector = await page.$('#UserLogin_username', { visible: true });

    const passwordSelector = await page.$('#UserLogin_password', { visible: true });

    console.log({
      emailSelector,
      passwordSelector
    });

    await emailSelector.type(email, { delay: 300 });
    await sleep(10);
    await passwordSelector.type(password, { delay: 400 });
    await sleep(10);

    const loginButton = await page.$('#login-button');
    console.log({ loginButton });

    await loginButton.click();
  } catch (err) {
    console.log('Error in pixiesetLoginMethod', err);
    if (retries > 0) {
      await page.reload();
      await pixiesetLoginMethod({
        page,
        email,
        password,
        retries: retries - 1
      });
    } else throw new Error('LOGIN FAILED!');
  }
};

export const navigateWithRetry = async (page, url) => {
  const MAX_TIMEOUT = 5 * 60 * 1000; 
  let currentTimeout = 30000;

  while (currentTimeout <= MAX_TIMEOUT) {
    try {
      console.log(`Attempting navigation with timeout: ${currentTimeout / 1000}s`);
      await page.goto(url, { timeout: currentTimeout });
      console.log('Navigation successful!');
      return;
    } catch (error) {
      console.log('Error in navigateWithRetry', { error })
      if (error?.message?.toLowerCase().includes('navigation timeout')) {
        console.log(`Navigation timeout after ${currentTimeout / 1000}s. Retrying...`);
        currentTimeout *= 2;
      } else {
        console.error('An UNexpected error occurred:', error);
        throw error;
      }
    }
  }

  throw new Error(`Failed to navigate to ${url} after reaching max timeout of ${MAX_TIMEOUT / 1000}s`);
}

export const navigateWithEvaluate = async (page, url, maxRetries = 3, delay = 2) => {
  let attempt = 0;
  while (attempt < maxRetries) {
      try {
          console.log(`Attempt ${attempt + 1}: Navigating to ${url}`);
          
          await page.evaluate((url) => {
              window.location.href = url;
          }, url);

          // Wait for navigation to complete
          await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 });

          console.log('Navigation successful');
          return;
      } catch (error) {
          console.error(`Navigation failed: ${error.message}`);
          attempt++;
          if (attempt < maxRetries) {
              console.log(`Retrying in ${delay / 1000} seconds...`);
              await sleep(2);
          } else {
              console.error('Max retries reached. Navigation failed.');
          }
      }
  }
}