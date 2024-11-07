import Client from '../models/client.js';

const SaveClients = async ({
  clients,
  userEmail
}) => {
  const writeData = clients.map((client) => {
    const {
      collectionId,
      galleryName,
      clientName: name,
      clientEmail: email
    } = client;

    return {
      updateOne: {
        filter: {
          userEmail,
          collectionId,
          email
        },
        update: {
          $set : {
            galleryName,
            name
          }
        },
        upsert: true
      }
    }
  });
  if (writeData.length) {
    const res =  await Client.bulkWrite(writeData);
    console.log({ SaveClients: res });
  }
};

export {
  SaveClients
};

