import { connect } from 'puppeteer-real-browser';

import { axiosInstance as axios, AxiosBaseUrl } from '../config/axios.js';
import { sendMessageToQueue } from '../config/sqs-consumer.js';

import {
  generateGUID,
  navigateWithRetry,
  sleep,
  getCookies,
  pixiesetLoginMethod,
  navigateWithEvaluate,
  retryHandler
} from '../helpers/common.js';

import { ENDPOINTS, PLATFORMS } from '../constants.js';

import CreateGalleriesInUserAccount from './upload-helpers.js';

const {
  userEmail,
  userPassword,
  uploadAccountId,
} = process.env;

const axiosBase = AxiosBaseUrl();


const getGalleryCollections = async ({
  galleries,
  filteredCookies
}) => {
  console.log('in getGalleryCollections');
  const galleryCollections = [];
  for (let i = 0; i < galleries?.length; i += 1) {
    const collection = galleries[i];
    const tagResponse = await retryHandler({
      fn: axios,
      args: [{
        url: `https://galleries.pixieset.com/api/v1/collections/${collection.id}/edit`,
        method: 'GET',
        headers: {
          'content-type': 'application/json, text/plain, */*',
          cookie: filteredCookies
        }
      }],
      taskName: `FETCH_TAGS_${collection.id}`
    });

    const guid  = generateGUID();
    galleryCollections.push({
      collectionId: collection.id,
      eventDate: collection.event_date,
      galleryName: collection.name,
      numberOfPhotos: collection.photo_count,
      coverPhoto: `${collection.coverPhoto ? 'https:' + collection.coverPhoto : ''}`,
      categories: `${tagResponse.data?.distinctTags?.join(',') || ''}`,
      externalProjRef: guid
    });
  }

  return galleryCollections;
}

const GetGalleries = async ({ filteredCookies, accountId }) => {
  try {
    console.log({ accountId });
  
    const [latestGallery] = (await axiosBase.post(ENDPOINTS.GALLERY.GET_GALLERIES, {
      filterParams: {
        accountId,
        platform: PLATFORMS.PIXIESET,
      },
      limit: 1,
      sort: { createdAt: -1 }
    })).data.galleries || [];

    console.log({ latestGallery })
    let pageNumber;
    const { pageNumber: latestPageNumber = 0 } = latestGallery || {};
    console.log({ latestPageNumber });
    pageNumber = latestPageNumber + 1;
    console.log({ pageNumber });

    const galleries = [];
    let response;
    try {
      response = await retryHandler({
        fn: axios,
        args: [{
          url: 'https://galleries.pixieset.com/api/v1/dashboard_listings',
          method: 'GET',
          headers: {
            cookie: filteredCookies
          },
          params: { page: pageNumber }
        }],
        taskName: 'FETCH_GALLERIES'
      });
    } catch (err) {
      if (err?.response?.status === 401) {
        throw new Error('UnauthorizedCookies');
      }
      throw err;
    }

    const { data } = response?.data || {};
    const { meta, data: galleriesData } = data || {};
    const { last_page: lastPage } = meta || {};
    const { collections } = galleriesData || {};

    let galleryCollections = await getGalleryCollections({ galleries: collections, filteredCookies });

    await retryHandler({
      fn: CreateGalleriesInUserAccount,
      args: [{
        uploadAccountId,
        platform: PLATFORMS.PIXIESET,
        galleryCollections,
      }],
      taskName: 'CREATE_GALLERIES_IN_USER_ACCOUNT'
    });

    const insertedGalleries = await retryHandler({
      fn: axiosBase.post,
      args: [ENDPOINTS.GALLERY.SAVE_GALLERY, {
        galleries: galleryCollections,
        platform: PLATFORMS.PIXIESET,
        pageNumber,
        accountId,
        galleryUploaded: true
      }],
      taskName: 'Save Gallery'
    });

    let insertedIds = insertedGalleries?.data?.response;

    if (insertedIds?.length) {
      for (const galleryId of insertedIds) {
        const message = {
          galleryId,
          accountId,
          uploadAccountId,
          platform: PLATFORMS.PIXIESET
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

    galleries.push(...galleryCollections);

    console.log({ lastPage, pageNumber });

    while (lastPage !== pageNumber) {
      pageNumber += 1;
      const response = await retryHandler({
        fn: axios,
        args: [{
          url: 'https://galleries.pixieset.com/api/v1/dashboard_listings?page=1',
          method: 'GET',
          headers: {
            'content-type': 'application/json',
            cookie: filteredCookies
          },
          params: {
            page: pageNumber
          }
        }],
        taskName: 'FETCH_GALLERIES'
      });

      const { data } = response?.data || {};
      const { data: galleriesData } = data || {};
      const { collections } = galleriesData || {};

      galleryCollections = await getGalleryCollections({ galleries: collections, filteredCookies });

      await retryHandler({
        fn: CreateGalleriesInUserAccount,
        args: [{
          uploadAccountId,
          platform: PLATFORMS.PIXIESET,
          galleryCollections,
        }],
        taskName: 'CREATE_GALLERIES_IN_USER_ACCOUNT'
      });

      const insertedGalleries = await retryHandler({
        fn: axiosBase.post,
        args: [ENDPOINTS.GALLERY.SAVE_GALLERY, {
          galleries: galleryCollections,
          platform: PLATFORMS.PIXIESET,
          pageNumber,
          accountId,
          galleryUploaded: true
        }],
        taskName: 'Save Gallery'
      });
  
      let insertedIds = insertedGalleries?.data?.response;
    
      if (insertedIds?.length) {
        for (const galleryId of insertedIds) {
          const message = {
            galleryId,
            accountId,
            uploadAccountId,
            platform: PLATFORMS.PIXIESET
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
  
      galleries.push(...galleryCollections);
    }

    await axiosBase.post(ENDPOINTS.GALLERY.UPDATE_GALLERY, {
      filterParams: {
        accountId,
        platform: PLATFORMS.PIXIESET,
        collectionId: galleries[galleries?.length - 1]?.collectionId
      },
      updateParams: {
        allGalleriesSynced: true
      }
    });

    return galleries;
  } catch (err) {
    console.log('Error in GetGalleries method', err);
    throw err;
  }
};

const GetClientsGallery = async ({
  accountId,
  filteredCookies
}) => {
  try {
    let collections = [];
    const [gallery] = (await axiosBase.post(ENDPOINTS.GALLERY.GET_GALLERIES, {
      filterParams: {
        accountId,
        platform: PLATFORMS.PIXIESET,
        allGalleriesSynced: true
      },
      limit: 1
    })).data.galleries || [];

    if (!gallery) {
      collections = await GetGalleries({ filteredCookies, accountId });
    }

    console.log({ collections: collections?.length });

    return true;
  } catch (err) {
    console.log('Error in GetClientsGallery method', err);
    throw err;
  }
};

const PerformLogin = async (connectConfig, accountId) => {
  const { browser, page } = await connect(connectConfig);
  await page.setViewport({ width: 1920, height: 1080 });
  await navigateWithRetry(page, 'https://accounts.pixieset.com/login');
  await sleep(10);

  if (page.url().includes('/login')) {
    await pixiesetLoginMethod({
      page,
      email: userEmail,
      password: userPassword
    });
  }
  await sleep(20);

  await navigateWithEvaluate(page, 'https://galleries.pixieset.com/collections');

  await sleep(10);

  const cookies = await page.cookies();
  const filteredCookies = getCookies({ cookies });

  await axiosBase.post(ENDPOINTS.ACCOUNT.UPDATE_ACCOUNT, {
    accountId,
    platform: PLATFORMS.PIXIESET,
    authorization: filteredCookies
  });

  return {
    browser,
    page,
    filteredCookies
  };
};

export {
  GetClientsGallery,
  PerformLogin
};
