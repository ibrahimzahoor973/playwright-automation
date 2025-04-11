import axios from 'axios';

const { API_URL } = process.env;

const axiosInstance = axios.create({
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    "Content-Type": 'application/json'
  }
});

const AxiosBaseUrl = () => {
  axios.defaults.baseURL = API_URL;
  return axios;
};

export {
  AxiosBaseUrl,
  axiosInstance
};
