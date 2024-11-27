import axios from 'axios';

import { SLACK_CHANNEL } from '../../constants.js';

const { userEmail, platform } = process.env;

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
  
    await axios.post(SLACK_CHANNEL, {
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
    const emailSelector = await page.$('input[type=emails]');

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

    loginButton.click();

    await sleep(10);
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
