import AWS_SDK from './aws.js';

const { QUEUE_URL: queueUrl } = process.env;

const sqs = new AWS_SDK.SQS();

const sendMessageToQueue = async (message) => {
  const params = {
    MessageBody: JSON.stringify(message),
    QueueUrl: queueUrl,
  };

  return new Promise((resolve, reject) => {
    sqs.sendMessage(params, (err, data) => {
      if (err) {
        console.log('Error sending to SQS', err);
        reject(err);
      } else {
        console.log('Successfully added message', data.MessageId);
        resolve(data);
      }
    });
  });
};

export { sendMessageToQueue };
