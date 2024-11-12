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
