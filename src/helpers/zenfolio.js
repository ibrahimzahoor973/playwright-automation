import pkg from 'lodash';
import axios from '../../config/axios.js';
import fs from 'fs';
import path from 'path';

import { SaveGalleries, UpdateGallery, GetGalleries as GetGalleriesFromDb, UpdateGalleries } from '../../db-services/gallery.js';
import { SaveClients, SaveZenFolioClients } from '../../db-services/client.js';
import { GetGallerySets, SaveZenFolioGallerySets, UpdateGallerySet, UpdateGallerySets } from '../../db-services/gallery-set.js';
import { SaveGalleryPhotos } from '../../db-services/photo.js';
import { generateGUID, navigateWithRetry, sleep } from './common.js';

const { groupBy } = pkg;

const { platform } = process.env;

const parseGalleries = ({
  collections
}) => {
  const baseUrl = "https://zenfolio.creatorcdn.com";

  return collections.map((collection) => {
    const guid = generateGUID();
    const topMedia = collection?.topMedia?.[0];

    const coverPhoto = topMedia
      ? `${baseUrl}${collection.photoUrlTemplate
          ?.replace("~sizeCode~", "L")
          .replace("~photoId~", topMedia.id)
          .replace("~photoVersion~", topMedia.photoVersion)
          .replace("~resizeMethod~", "1")
          .replace("~photoTitle~", topMedia.fileName)}`
      : null;

    return {
      collectionId: collection?.id,
      galleryName: collection?.name,
      numberOfPhotos: collection?.photoCount,
      eventDate: collection?.dateCreated,
      categories: collection?.eventCategory || '',
      coverPhoto,
      externalProjRef: guid
    }
  });
}

const parseClients = ({ clients }) => {
  return clients.map((client) => {
    const {
      id,
      firstName,
      lastName,
      ...rest
    } = client;

    return {
      clientId: id,
      fullName: `${firstName} ${lastName}`.trim(),
      ...rest,
    };
  });
};

const parseCollections = ({
  galleryId,
  collections
}) => {
  return collections
    .filter(collection => collection.mediaSortIndices && collection.mediaSortIndices.length > 0)
    .map((collection) => {
      let { collectionId, name, mediaSortIndices, ...rest } = collection;

      if (!collectionId) {
        name = "Photos";
      }

      return {
        galleryId,
        setId: collectionId,
        name,
        numberOfPhotos: mediaSortIndices.length,
        ...rest,
      };
    });
};

const assignSetIdToPhotos = (photos, collections) => {
  const photoToCollectionMap = new Map();
  const setIds = new Set();
  
  collections.forEach(collection => {
    const setId = collection.collectionId || null;
    const setName = collection.collectionId ? collection.name : "Photos";
    
    if (collection.mediaSortIndices && collection.mediaSortIndices.length) {
      collection.mediaSortIndices.forEach(media => {
        photoToCollectionMap.set(media.id, { setId, setName });
      });
      if (setId) setIds.add(setId);
    }
  });

  const updatedPhotos = photos.map(photo => {
    const collectionInfo = photoToCollectionMap.get(photo.id) || { setId: null, setName: "Photos" };
    return { ...photo, setId: collectionInfo.setId, setName: collectionInfo.setName };
  });
  
  return { updatedPhotos, setIds: [...setIds] };
};

const parsePhotos = ({
  collectionId,
  galleryName,
  photos
}) => {
  return photos.map((photo) => {
    const {
      id,
      name,
      setId,
      setName,
      ...rest
    } = photo;

    return {
      collectionId,
      galleryName,
      photoId: id,
      setId,
      setName,
      name,
      ...rest,
    };
  });
};

const GetGalleries = async ({
  authorizationToken,
  skip,
  take
}) => {
  const response = await axios({
    url: `https://app.zenfolio.com/api/folders/v1/galleries/content?active=true&inactive=true`,
    method: 'GET',
    headers: {
      'content-type': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Authorization: authorizationToken
    },
    params: {
      skip,
      take
    }
  });

  const {
    count: totalGalleries,
    galleriesContent = []
  } = response?.data || {};

  return {
    totalGalleries,
    galleriesContent
  }
}

const GetClients = async ({
  authorizationToken,
  collectionId,
  skip,
  take
}) => {
  const response = await axios({
    url: `https://app.zenfolio.com/api/folders/v1/folders/accessors?folderId=${collectionId}&sortBy=dateCreated`,
    method: 'GET',
    headers: {
      'content-type': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Authorization: authorizationToken
    },
    params: {
      skip,
      take
    }
  });

  const {
    count: totalClients,
    userAccesses = []
  } = response?.data || {};

  return {
    totalClients,
    userAccesses
  }
}

const GetGallerySetsAndPhotos = async ({
  authorizationToken,
  collectionId
}) => {
  const response = await axios({
    url: `https://app.zenfolio.com/api/folders/v1/folders/${collectionId}/photos`,
    method: 'GET',
    headers: {
      'content-type': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Authorization: authorizationToken
    }
  });

  const {
    photos = [],
    collections = []
  } = response?.data || {};

  return {
    collections,
    photos
  }
}

const GetAndSaveGalleries = async ({
  authorizationToken,
  userEmail
}) => {
  let collections = [];

  let skip = 0;
  const take = 100;

  const { totalGalleries, galleriesContent = [] } = await GetGalleries({
    authorizationToken,
    skip,
    take
  });

  console.log({
    totalGalleries,
    galleriesContent: galleriesContent.length
  });

  if (galleriesContent.length) {
    const galleries = parseGalleries({ collections: galleriesContent });

    collections.push(...galleries);
  
    await SaveGalleries({
      galleries,
      userEmail,
      platform
    });
  
    while (skip < totalGalleries) {
      skip += take;
  
      const { totalGalleries, galleriesContent } = await GetGalleries({
        authorizationToken,
        skip,
        take
      });
      const galleries = parseGalleries({ collections: galleriesContent });
  
      await SaveGalleries({
        galleries,
        userEmail,
        platform
      });
  
      collections.push(...galleries);
      console.log({
        collections: collections.length
      });
    }
  
    console.log({
      collectionsAtTheEnd: collections.length,
      collectionId: collections[collections.length - 1]?.collectionId
    });
  
    await UpdateGallery({
      filterParams: {
        userEmail,
        platform,
        collectionId: collections[collections.length - 1]?.collectionId
      },
      updateParams: {
        allGalleriesSynced: true
      }
    });
  }
};

const GetAndSaveClients = async ({
  authorizationToken,
  userEmail,
  platform,
  collectionId,
  galleryName
}) => {
  let clients = [];

  let skip = 0;
  const take = 100;

  const { totalClients, userAccesses = [] } = await GetClients({
    authorizationToken,
    collectionId,
    skip,
    take
  });

  console.log({
    totalClients,
    userAccesses: userAccesses.length
  });

  if (userAccesses.length) {
    const contacts = parseClients({ clients: userAccesses });

    clients.push(...contacts);
  
    await SaveZenFolioClients({
      clients,
      collectionId,
      userEmail,
      galleryName,
      platform
    });
  
    while (skip < totalClients) {
      skip += take;
  
      const { totalClients, userAccesses } = await GetClients({
        authorizationToken,
        collectionId,
        skip,
        take
      });
      const contacts = parseClients({ clients: userAccesses });
  
      await SaveZenFolioClients({
        clients,
        collectionId,
        userEmail,
        galleryName,
        platform
      });
  
      clients.push(...contacts);
      console.log({
        clients: clients.length
      });
    }
  
    await UpdateGallery({
      filterParams: {
        collectionId
      },
      updateParams: {
        clientsSynced: true
      }
    });
  }
};

const GetAndSaveGallerySetsAndPhotos = async ({
  authorizationToken,
  userEmail,
  platform,
  collectionId,
  galleryName
}) => {
  let collectionsData = [];
  let photosData = [];

  const { collections = [], photos = [] } = await GetGallerySetsAndPhotos({
    authorizationToken,
    collectionId
  });

  console.log({
    collections: collections.length,
    photos: photos.length
  });

  if (collections.length) {
    const parsedCollections = parseCollections({
      galleryId: collectionId,
      collections
    });

    if (parsedCollections.length) {
      collectionsData.push(...parsedCollections);

      await SaveZenFolioGallerySets({
        gallerySets: collectionsData,
        galleryName,
        userEmail,
        platform
      });

      await UpdateGallery({
        filterParams: { collectionId },
        updateParams: { gallerySetsSynced: true }
      });
    }
  }

  if (photos.length) {
    const { updatedPhotos, setIds } = assignSetIdToPhotos(photos, collections);
  
    const parsedPhotos = parsePhotos({
      collectionId,
      galleryName,
      photos: updatedPhotos
    });

    photosData.push(...parsedPhotos);
    
    await SaveGalleryPhotos({
      photos: photosData,
      userEmail,
      platform
    });
  
    await UpdateGallery({
      filterParams: {
        collectionId
      },
      updateParams: {
        photosSynced: true
      }
    });
  
    await UpdateGallerySets({
      filterParams: {
        collectionId,
        setId: { $in: setIds }
      },
      updateParams: {
        photosSynced: true
      }
    });
  }
};

const GetAlbumsAndPhotos = async ({
  page,
  userEmail,
  platform,
  baseUrl,
  authorizationToken
}) => {
  try {
    await navigateWithRetry(page, baseUrl);
      let collections = [];

      const [gallery] = await GetGalleriesFromDb({
        filterParams: {
          userEmail,
          platform,
          allGalleriesSynced: true
        }, limit: 1
      });

      console.log({ gallery });

      if (!gallery) {
        await GetAndSaveGalleries({
          authorizationToken,
          platform,
          userEmail
        });
      }

      collections = await GetGalleriesFromDb({
        filterParams: {
          userEmail,
          platform,
          clientsSynced: { $exists: false }
        }
      });

      console.log({
        collectionsFromDb: collections.length
      });

      for (let i = 0; i < collections.length; i += 1) {
        const collection = collections[i];
        await GetAndSaveClients({
          authorizationToken,
          userEmail,
          platform,
          collectionId: collection.collectionId,
          galleryName: collection.name
        });
        console.log(`Clients For Collection Id ${collection.collectionId} are saved\n`);
      }

      collections = await GetGalleriesFromDb({
        filterParams: {
          userEmail,
          platform,
          gallerySetsSynced: { $exists: false }
        }
      });

      for (let i = 0; i < collections.length; i += 1) {
        const collection = collections[i];
        console.log({
          collection: collection.collectionId
        });
      
        await GetAndSaveGallerySetsAndPhotos({
          authorizationToken,
          collectionId: collection.collectionId,
          galleryName: collection.name,
          userEmail,
          platform
        });
      }
    return true;
  } catch (err) {
    console.log('Error in GetGalleryPhotos method', err);
    throw err;
  }
};

export default GetAlbumsAndPhotos;
