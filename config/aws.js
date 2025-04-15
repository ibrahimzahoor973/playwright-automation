import AWS_SDK from 'aws-sdk';

const {
  AWS_ACCESS_KEY_ID: accessKeyId,
  AWS_SECRET_ACCESS_KEY: secretAccessKey,
  AWS_REGION: region,
} = process.env;

AWS_SDK.config.update({
  accessKeyId,
  secretAccessKey,
  region
});

export default AWS_SDK;
