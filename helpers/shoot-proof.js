import chrome from 'puppeteer-extra';

import { axiosInstance as axios, AxiosBaseUrl } from '../config/axios.js';

import { sendMessageToQueue } from '../config/sqs-consumer.js';

import {
  generateGUID,
  navigateWithRetry,
  sleep,
  retryHandler,
  loginToShootProof
} from '../helpers/common.js';

import { ENDPOINTS, PLATFORMS } from '../constants.js';

import CreateGalleriesInUserAccount from './upload-helpers.js';

const {
  PIPELINE_EVENT
} = process.env;

const {
  taskType,
  accountId,
  uploadAccountId,
} = JSON.parse(PIPELINE_EVENT)

const axiosBase = AxiosBaseUrl();


const GetAndSaveBrand = async ({
  userAgent,
  authorizationToken,
  userEmail
}) => {
  let response;
  try {
    response = await retryHandler({
      fn: axios,
      args: [{
        url: 'https://api.shootproof.com/studio/brand',
        method: 'GET',
        headers: {
        'content-type': 'application/json, text/plain, */*',
        'User-Agent': userAgent,
        'authorization': authorizationToken
        }
      }],
      taskName: 'GetAndSaveBrand'
    });

  } catch (err) {
    if (err?.response?.status === 401) {
      throw new Error('UnauthorizedCookies');
    }
    throw err;
  }

  let brandId;

  const { data: { items = [] } = {} } = response;
  if (items.length) {
    const brand = items.find((item) => item.email === userEmail);

    brandId = brand?.id;
    await axiosBase.post(ENDPOINTS.ACCOUNT.UPDATE_ACCOUNT, {
      accountId,
      platform: PLATFORMS.SHOOTPROOF,
      shootProofBrandId: brandId
    });
    
    return brandId;
  }
}

const parseGalleries = ({
  collections
}) => {
  return collections.map((collection) => {
    const guid = generateGUID();
    let coverPhoto;
    if (collection.coverPhoto) {
      const { coverPhoto: { displayUrl : { large } = {} } } = collection;
      coverPhoto = large;
    }
    return {
    collectionId: collection.id,
    galleryName: collection.name,
    numberOfPhotos: collection.photosCount,
    eventDate: collection.eventDate,
    categories: collection.eventCategory,
    coverPhoto,
    externalProjRef: guid
  }
  });
}

const GetGalleries = async ({
  authorizationToken,
  userAgent,
  brandId,
  page
}) => {
  let response;
  try {
    response = await retryHandler({
      fn: axios,
      args: [{
        url: `https://api.shootproof.com/studio/brand/${brandId}/event`,
        method: 'GET',
        headers: {
          'content-type': 'application/json, text/plain, */*',
          'User-Agent': userAgent,
          Authorization: authorizationToken
        },
        params: {
          rows: 100,
          page
        }
      }],
      taskName: 'GetGalleries'
    });

  } catch (err) {
    if (err?.response?.status === 401) {
      throw new Error('UnauthorizedCookies');
    }
    throw err;
  }

  const {
    meta: {
      totalPages
    } = {},
    items = []
  } = response?.data || {};

  return {
    totalPages,
    items
  }
}

const GetAndSaveGalleries = async ({ authorizationToken, userAgent, brandId }) => {
  let collections = [];

  let page = 1;

  const { totalPages, items = [] } = await GetGalleries({
    authorizationToken,
    userAgent,
    brandId,
    page
  });

  console.log({
    totalPages,
    items: items.length
  });

  if (items.length) {
    const galleries = parseGalleries({ collections: items });

    await retryHandler({
      fn: CreateGalleriesInUserAccount,
      args: [{
        uploadAccountId,
        platform: PLATFORMS.SHOOTPROOF,
        galleryCollections: galleries,
      }],
      taskName: 'CREATE_GALLERIES_IN_USER_ACCOUNT'
    });

    collections.push(...galleries);

    const insertedGalleries = await retryHandler({
      fn: axiosBase.post,
      args: [ENDPOINTS.GALLERY.SAVE_GALLERY, {
        galleries,
        platform: PLATFORMS.SHOOTPROOF,
        accountId,
        pageNumber: page,
        galleryUploaded: true
      }],
      taskName: 'SAVE_GALLERIES'
    });
  
    let insertedIds = insertedGalleries?.data?.response;
    
    if (insertedIds?.length) {
      for (const galleryId of insertedIds) {
        const message = {
          taskType,
          galleryId,
          accountId,
          uploadAccountId,
          platform: PLATFORMS.SHOOTPROOF,
        };
    
        try {
          console.log({ message });
          await retryHandler({
            fn: sendMessageToQueue,
            args: [message],
            taskName: 'Send Message to Queue'
          });
        } catch (err) {
          console.error('Failed to push gallery to queue:', galleryId, err);
        }
      }
    }
  
    while (page < totalPages) {
      page += 1;
  
      const { totalPages, items } = await GetGalleries({
        authorizationToken,
        brandId,
        page
      });
  
      totalPages = meta?.totalPages;
      items = data?.items;
  
      const galleries = parseGalleries({ collections: items });

      await retryHandler({
        fn: CreateGalleriesInUserAccount,
        args: [{
          uploadAccountId,
          platform: PLATFORMS.SHOOTPROOF,
          galleryCollections: galleries,
        }],
        taskName: 'CREATE_GALLERIES_IN_USER_ACCOUNT'
      });
  
      const insertedGalleries = await retryHandler({
        fn: axiosBase.post,
        args: [ENDPOINTS.GALLERY.SAVE_GALLERY, {
          galleries,
          platform: PLATFORMS.SHOOTPROOF,
          accountId,
          pageNumber: page,
          galleryUploaded: true
        }],
        taskName: 'SAVE_GALLERIES'
      });

      let insertedIds = insertedGalleries?.data?.response;
    
      if (insertedIds?.length) {
        for (const galleryId of insertedIds) {
          const message = {
            taskType,
            galleryId,
            accountId,
            uploadAccountId,
            platform: PLATFORMS.SHOOTPROOF,
          };
      
          try {
            console.log({ message });
            await retryHandler({
              fn: sendMessageToQueue,
              args: [message],
              taskName: 'Send Message to Queue'
            });
          } catch (err) {
            console.error('Failed to push gallery to queue:', galleryId, err);
          }
        }
      }

      collections.push(...galleries);
      console.log({
        collections: collections.length
      });
    }
  
    console.log({
      collectionsAtTheEnd: collections.length,
      collectionId: collections[collections.length - 1]?.collectionId
    });
  
    await retryHandler({
      fn: axiosBase.post,
      args: [ENDPOINTS.GALLERY.UPDATE_GALLERY, {
        filterParams: {
          accountId,
          platform: PLATFORMS.SHOOTPROOF,
          collectionId: collections[collections.length - 1]?.collectionId
        },
        updateParams: {
          allGalleriesSynced: true
        }
      }],
      taskName: 'SAVE_GALLERIES'
    });
  }
};

const aggregatePhotos = (album) => {
  let totalPhotos = album.photosCount;
  let childIds = [];
  
  for (const child of album.children) {
    const { totalPhotos: childPhotos, childIds: nestedChildIds } = aggregatePhotos(child);
    totalPhotos += childPhotos;
    childIds.push((child.id).toString(), ...nestedChildIds);
  }
  
  album.totalPhotos = totalPhotos;
  album.childIds = childIds;
  
  return { totalPhotos, childIds };
}

const GetShootProofAlbums = async ({
  page,
  userAgent,
  baseUrl,
  userEmail,
  authorizationToken
}) => {
  try {
    await navigateWithRetry(page, baseUrl);
    let brandId;

    const res = await retryHandler({
      fn: axiosBase.post,
      args: [ENDPOINTS.ACCOUNT.GET_ACCOUNT, {
        accountId,
        platform: PLATFORMS.SHOOTPROOF,
        uploadScriptAccount: false
      }],
      taskName: 'Get Account Info'
    });
    
    const account = res.data.account;
    
    console.log({
      account
    });

    const { shootProofBrandId } = account || {};
    brandId = shootProofBrandId;
    if (!brandId) {
      const brandIdentifier = await GetAndSaveBrand({
        authorizationToken,
        userAgent,
        userEmail
      });
      console.log({
        brandIdentifier
      })
      brandId = brandIdentifier;
    }

    if (brandId) {
      const [gallery] = (await axiosBase.post(ENDPOINTS.GALLERY.GET_GALLERIES, {
        filterParams: {
          accountId,
          platform: PLATFORMS.SHOOTPROOF,
          allGalleriesSynced: true
        },
        limit: 1
      })).data.galleries || [];

      console.log({
        gallery,
        brandId
      });

      if (!gallery) {
        await GetAndSaveGalleries({ authorizationToken, userAgent, brandId });
      }
    }

    return true;
  } catch (err) {
    console.log('Error in GetGalleryPhotos method', err);
    throw err;
  }
};

const PerformLogin = async (userEmail, userPassword, connectConfig, proxyObject) => {
  const browser = await chrome.launch(connectConfig);
  const page = await browser.newPage();

  const userAgent = await browser.userAgent();
  
  if (proxyObject) {
    await page.authenticate({ username: proxyObject.username, password: proxyObject.password }); 
    console.log('Proxy Authenticated!');
  }

  await navigateWithRetry(page, 'https://studio.shootproof.com');

  if (page.url().includes('/login')) {

    await loginToShootProof({
      page,
      email: userEmail,
      password: userPassword
    });
  }

  const url = page.url();
  const baseUrl =  new URL(url).origin;

  console.log({ baseUrl });

  await navigateWithRetry(page, `${baseUrl}`);

  console.log('Current Url', page.url());

  await page.setRequestInterception(true);

  let authorizationToken;
  const requestHandler = async (req) => {
    if (req.url().includes('shootproof.com')) {
      const headers = req.headers();
  
      if (headers.authorization) {
        authorizationToken = headers.authorization;
      }
    }
  
    await req.continue();
  };

  page.on('request', requestHandler);

  while (!authorizationToken) {
    await sleep(10);
    await page.reload();
  }
  
  console.log('Token found:', {
    authorizationToken
  });

  await axiosBase.post(ENDPOINTS.ACCOUNT.UPDATE_ACCOUNT, {
    accountId,
    platform: PLATFORMS.SHOOTPROOF,
    authorization: authorizationToken
  });

  return { page, userAgent, baseUrl, browser, authorizationToken };
};

export {
  GetShootProofAlbums,
  PerformLogin
};
