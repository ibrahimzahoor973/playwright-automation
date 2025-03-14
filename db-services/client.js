import pkg from 'lodash';

import Client from '../models/client.js';

const { chunk } = pkg;

const SaveClients = async ({
  clients: clientsData,
  userEmail,
  platform
}) => {
  const clientChunks = chunk(clientsData, 200);

  console.log({ clientChunks: clientChunks.length });

  for (let i = 0; i < clientChunks.length; i += 1) {
    const clients = clientChunks[i];

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
              name,
              platform
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
  }
};

const GetClients = async ({
  filterParams,
  limit,
  sort
}) => {
  const clients = await Client.find(filterParams).limit(limit).sort(sort);

  return clients;
};

export {
  SaveClients,
  GetClients
};

