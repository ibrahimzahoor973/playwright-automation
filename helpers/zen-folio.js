import chrome from 'puppeteer-extra';

import { axiosInstance as axios, AxiosBaseUrl } from '../config/axios.js';

import { sendMessageToQueue } from '../config/sqs-consumer.js';

import {
  generateGUID,
  navigateWithRetry,
  sleep,
  retryHandler,
  loginToZenFolio
} from '../helpers/common.js';

import { ENDPOINTS } from '../constants.js';

import CreateGalleriesInUserAccount from './upload-helpers.js';

const {
  userEmail,
  userPassword,
  accountId,
  uploadAccountId,
  platform
} = process.env;

const axiosBase = AxiosBaseUrl();

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

const GetGalleries = async ({
  authorizationToken,
  skip,
  take
}) => {
  let response;
  try {
    response = await retryHandler({
      fn: axios,
      args: [{
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
      }],
      taskName: 'GetGalleriesZenFolio'
    });
  } catch (err) {
    if (err?.response?.status === 401) {
      throw new Error('UnauthorizedCookies');
    }
    throw err;
  }

  const {
    count: totalGalleries,
    galleriesContent = []
  } = response?.data || {};

  return {
    totalGalleries,
    galleriesContent
  }
}

const GetAndSaveGalleries = async ({ authorizationToken }) => {
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

    await retryHandler({
      fn: CreateGalleriesInUserAccount,
      args: [{
        uploadAccountId,
        platform,
        galleryCollections: galleries,
      }],
      taskName: 'CREATE_GALLERIES_IN_USER_ACCOUNT'
    });

    collections.push(...galleries);
  
    const insertedGalleries = await retryHandler({
      fn: axiosBase.post,
      args: [ENDPOINTS.GALLERY.SAVE_GALLERY, {
        galleries,
        platform,
        accountId,
        galleryUploaded: true
      }],
      taskName: 'SAVE_GALLERIES'
    });
  
    let insertedIds = insertedGalleries?.data?.response;
    
    if (insertedIds?.length) {
      for (const galleryId of insertedIds) {
        const message = {
          galleryId,
          accountId,
          uploadAccountId,
          platform
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
  
    while (skip < totalGalleries) {
      skip += take;
  
      const { totalGalleries, galleriesContent } = await GetGalleries({
        authorizationToken,
        skip,
        take
      });
      const galleries = parseGalleries({ collections: galleriesContent });

      await retryHandler({
        fn: CreateGalleriesInUserAccount,
        args: [{
          uploadAccountId,
          platform,
          galleryCollections: galleries,
        }],
        taskName: 'CREATE_GALLERIES_IN_USER_ACCOUNT'
      });
  
      const insertedGalleries = await retryHandler({
        fn: axiosBase.post,
        args: [ENDPOINTS.GALLERY.SAVE_GALLERY, {
          galleries,
          platform,
          accountId,
          galleryUploaded: true
        }],
        taskName: 'SAVE_GALLERIES'
      });

      let insertedIds = insertedGalleries?.data?.response;
    
      if (insertedIds?.length) {
        for (const galleryId of insertedIds) {
          const message = {
            galleryId,
            accountId,
            uploadAccountId,
            platform
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
          platform,
          collectionId: collections[collections.length - 1]?.collectionId
        },
        updateParams: {
          allGalleriesSynced: true
        }
      }],
      taskName: 'UPDATE_GALLERIES'
    });
  }
};

const GetZenFolioAlbums = async ({
  page,
  baseUrl,
  authorizationToken
}) => {
  try {
    await navigateWithRetry(page, baseUrl);

    const [gallery] = (await axiosBase.post(ENDPOINTS.GALLERY.GET_GALLERIES, {
      filterParams: {
        accountId,
        platform,
        allGalleriesSynced: true
      },
      limit: 1
    })).data.galleries || [];

    console.log({ gallery });

    if (!gallery) {
      await GetAndSaveGalleries({ authorizationToken });
    }
    return true;
  } catch (err) {
    console.log('Error in GetGalleryPhotos method', err);
    throw err;
  }
};

const PerformLogin = async (connectConfig, proxyObject) => {
  const browser = await chrome.launch(connectConfig);
  const page = await browser.newPage();
  
  if (proxyObject) {
    await page.authenticate({ username: proxyObject.username, password: proxyObject.password }); 
    console.log('Proxy Authenticated!');
  }

  await navigateWithRetry(page, 'https://app.zenfolio.com');

  if (page.url().includes('/welcome')) {
    await loginToZenFolio({
      page,
      email: userEmail,
      password: userPassword
    });
  }

  const baseUrl = new URL(page.url()).origin;
  console.log({ baseUrl });

  await navigateWithRetry(page, baseUrl);
  console.log('Current URL:', page.url());

  let authorizationToken = null;
  await page.setRequestInterception(true);


  page.on('request', async (req) => {
    if (req.url().includes('zenfolio.com')) {
      const headers = req.headers();
      if (headers.authorization) authorizationToken = headers.authorization;
    }
    await req.continue();
  });

  while (!authorizationToken) {
    await sleep(10);
    await page.reload();
  }
  
  console.log('Token found:', {
    authorizationToken
  });

  await axiosBase.post(ENDPOINTS.ACCOUNT.UPDATE_ACCOUNT, {
    accountId,
    platform,
    authorization: authorizationToken
  });

  return { page, browser, baseUrl, authorizationToken };
};

export {
  GetZenFolioAlbums,
  PerformLogin
};