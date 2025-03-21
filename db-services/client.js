import pkg from 'lodash';

import Client from '../models/client.js';

import { sleep } from '../src/helpers/common.js';

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
            $set: {
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
      let retries = 3;
      while (retries > 0) {
        try {
          const res = await Client.bulkWrite(writeData);
          console.log({ SaveClients: res });
          break;
        } catch (err) {
          console.log('Error in Save Clients Bulk Write', err);
          retries -= 1;
          if (retries === 0) {
            throw err;
          }
          console.log(`Retrying... attempts left: ${retries}`);
          await sleep(5);
        }
      }
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

