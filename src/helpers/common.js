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
  console.log('error message', errorMessage)
  const body = `
      (Msg through Automation) \n
      Task: ${task}
      Account: ${userEmail},
      Platform: '${platform}'
      Error: ${errorMessage}
    `;
  await axios.post(SLACK_CHANNEL, {
    text: body
  });

  return true;
};
