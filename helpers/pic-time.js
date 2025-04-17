import chrome from 'puppeteer-extra';
import moment from 'moment';

import { axiosInstance as axios, AxiosBaseUrl } from '../config/axios.js';

import { sendMessageToQueue } from '../config/sqs-consumer.js';

import {
  generateGUID,
  navigateWithRetry,
  sleep,
  getCookies,
  retryHandler,
  loginMethod
} from '../helpers/common.js';

import { ENDPOINTS, PLATFORMS } from '../constants.js';

import CreateGalleriesInUserAccount from './upload-helpers.js';

const {
  PIPELINE_EVENT
} = process.env;

const {
  accountId,
  uploadAccountId,
} = PIPELINE_EVENT;

const axiosBase = AxiosBaseUrl();

const getStorageMapping = async ({
  filteredCookies,
  baseUrl
}) => {
  const response = await retryHandler({
    fn: axios,
    args: [{
      url: `${baseUrl}/professional`,
      method: 'GET',
      headers: {
        'content-type': 'application/json',
        cookie: filteredCookies
      }
    }],
    taskName: 'getStorageMapping'
  });
  
  const content = response.data || {};
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let storageMapping = [];

  while ((match = scriptRegex.exec(content)) !== null) {
    const scriptContent = match[1];
    const tokenMatch = scriptContent.match(/_pictimeStorageMapping\s*=\s*(\[[\s\S]*?\]);/);
    if (tokenMatch) {
      console.log('Extracted _pictimeStorageMapping:', tokenMatch[1]);
      storageMapping = tokenMatch[1];
      return JSON.parse(storageMapping);
    }
  }
};

const parseClientGalleries = ({
  galleriesData,
  storageMapping
}) => {
  const galleries = galleriesData.map((gallery) => {
    const collectionId =  String(gallery[9]) || '';
    const coverPhoto = gallery[10];
    const storageId = gallery[19];
    const storageFound = storageMapping.find(data => data.storageId === storageId);
    const guid = generateGUID();

    console.log({
      collectionId
    })

    return {
    collectionId,
    galleryName: gallery[7] || '',
    numberOfPhotos: gallery[8] || 0,
    eventDate: gallery[6] || '',
    createdDate: gallery[4] || null,
    offline: gallery[0] === 15 ? true : false,
    storageId,
    coverPhoto,
    coverPhotoUrl: `${storageFound.cdnDomain}/pictures/${Number(collectionId.substr(0, 2))}/${Number(collectionId.substr(2, 3))}/${collectionId}/homepage/smallres/${coverPhoto}`,
    externalProjRef: guid
  }
  });

  console.log({
    galleries
  });

  return galleries;
};

export const GetGalleries = async ({
  baseUrl,
  filteredCookies
}) => {
  let response;
  try {
    response = await retryHandler({
      fn: axios,
      args: [{
        url: `${baseUrl}/!servicesp.asmx/dashboard`,
        method: 'POST',
        headers: {
          cookie: filteredCookies,
          "Content-Type": 'application/json; charset=UTF-8'
        }
      }],
      taskName: 'FETCH_GALLERIES'
    });

  } catch (err) {
    if (err?.response?.status === 403) {
      throw new Error('UnauthorizedCookies');
    }
    throw err;
  }

  const { data: { d = {} } = {} } = response;
  const galleriesData = d.projects_s || [];

  const storageMapping = await getStorageMapping({
    filteredCookies,
    baseUrl
  });

  console.log({
    storageMapping
  })

  const galleries = parseClientGalleries({ galleriesData, storageMapping });

  const oldGalleries = galleries.filter((gallery) => moment(gallery.createdDate).add(1, 'year').isBefore(moment()));

  console.log('galleries:', galleries.length);

  console.log('oldGalleries:', oldGalleries.length);

  await retryHandler({
    fn: CreateGalleriesInUserAccount,
    args: [{
      uploadAccountId,
      platform: PLATFORMS.PIC_TIME,
      galleryCollections: galleries,
    }],
    taskName: 'CREATE_GALLERIES_IN_USER_ACCOUNT'
  });

  const insertedGalleries = await retryHandler({
    fn: axiosBase.post,
    args: [ENDPOINTS.GALLERY.SAVE_GALLERY, {
      galleries,
      platform: PLATFORMS.PIC_TIME,
      accountId,
      baseUrl,
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
          platform: PLATFORMS.PIC_TIME
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

  const oldGalleryIds = oldGalleries.map((gallery) => gallery.collectionId);

  
  await retryHandler({
    fn: axiosBase.post,
    args: [ENDPOINTS.GALLERY.UPDATE_GALLERY, {
      filterParams: {
        accountId,
        platform: PLATFORMS.PIC_TIME,
        collectionId: { $in: oldGalleryIds },
      },
      updateParams: {
        isArchived: true
      }
    }],
    taskName: 'SAVE_GALLERIES'
  });

  await retryHandler({
    fn: axiosBase.post,
    args: [ENDPOINTS.GALLERY.UPDATE_GALLERY, {
      filterParams: {
        accountId,
        platform: PLATFORMS.PIC_TIME,
        collectionId: galleries[galleries.length - 1]?.collectionId
      },
      updateParams: {
        allGalleriesSynced: true
      }
    }],
    taskName: 'SAVE_GALLERIES'
  });
};

const SaveClientGalleries = async ({
  baseUrl,
  filteredCookies
}) => {
  try {
    let collections = [];
    const [gallery] = (await axiosBase.post(ENDPOINTS.GALLERY.GET_GALLERIES, {
      filterParams: {
        accountId,
        platform: PLATFORMS.PIC_TIME,
        allGalleriesSynced: true
      },
      limit: 1
    })).data.galleries || [];

    if (!gallery) {
      collections = await GetGalleries({
        baseUrl,
        filteredCookies
      });
    }

    console.log({ collections: collections?.length });
  } catch (err) {
    console.log('Error in GetSetsAndPhotos ', err);
    throw err;
  }
};

const handleCaptcha = async ({ page }) => {
  let retries = 3;

  let errorDiv = await page.$('.ptErrorPage');

  while (errorDiv) {
    if (retries > 0) {
      console.log('Captcha came!', retries);
      const returnToSiteButton = await page.$('.errorUnblockBtn');
      await returnToSiteButton?.click();
      await sleep(10);
      errorDiv = await page.$('.ptErrorPage');
    } else {
      throw new Error('Retry After Some Time!');
    }
    retries -= 1;
  }
};

const allowHighResDownloads = async ({
  baseUrl,
  projectId,
  filteredCookies
}) => {
  try {
    const payload = {
      saveBatch: {
        projectCreate: {
          newProjectIds: [],
          newSceneIds: [],
          newSelectionIds: []
        },
        projectProps: [{
          projectId,
          downloadPolicy: {
            freeDownloadsCount: 0,
            allowStore: 0,
            boundHeight: 2000,
            boundWidth: 2000,
            hiresSampling: 0,
            hiresScope: 1,
            lowresSampling: 0,
            lowresScope: 100,
            sceneIds: null
          }
        }],
        artPricing: [],
        projectSelectionProps: [],
        projectScenesProps: [],
        projectSelections: [],
        campaignsUpdate: [],
        projectExport: [],
        projectComments: [],
        setupPricing: [],
        setupBrand: [],
        setupAccount: [],
        actions: {
          publish: [],
          sceneReorder: [],
          photosReorder: []
        },
        dtoRevision: 39,
        ignoreDtoRevision: false
      }, pcpClientId: ''
    }
    const res = await retryHandler({
      fn: axios,
      args: [{
        url: `${baseUrl}/!servicesp.asmx/savePackage`,
        method: 'POST',
        headers: {
          cookie: filteredCookies
        },
        data: payload
      }],
      taskName: 'HIGH_RESOLUTION'
    });

    console.log('res of high res', res?.data);
  } catch (err) {
    console.log('Error in allowHighResDownloads:', err);
    throw err;
  }
};

const addClientInGallery = async ({
  baseUrl,
  filteredCookies,
  collectionId
}) => {
  try {
    const payload = {
      saveBatch: {
        projectCreate: {
          newProjectIds: [],
          newSceneIds: [],
          newSelectionIds: []
        },
        projectProps: [{
          projectId: collectionId,
          clientUsers: [{
            name: clientName,
            email: clientEmail
          }]
        }],
        artPricing: [],
        projectSelectionProps: [],
        projectScenesProps: [],
        projectSelections: [],
        campaignsUpdate: [],
        projectExport: [],
        projectComments: [],
        setupPricing: [],
        setupBrand: [],
        setupAccount: [],
        actions: {
          publish: [],
          sceneReorder: [],
          photosReorder: []
        },
        dtoRevision: 346,
        ignoreDtoRevision: false
      },
      pcpClientId: ''
    };

    const response = await retryHandler({
      fn: axios,
      args: [{
        url: `${baseUrl}/!servicesp.asmx/savePackage`,
        method: 'POST',
        headers: {
          cookie: filteredCookies,
          referer: `${baseUrl}/professional`,
          origin: baseUrl
        },
        data: payload
      }],
      taskName: 'ADD_CLIENT'
    });
  
    console.log('res of adding client', response?.data);

  } catch (err) {
    console.log('Err while Adding Client', err);
    throw err;
  }
};

const createShareLink = async ({
  baseUrl,
  filteredCookies,
  collectionId
}) => {
  try {
    const payload = {
      projectId: collectionId,
      useremail: clientEmail
    };

    const response = await retryHandler({
      fn: axios,
      args: [{
        url: `${baseUrl}/!servicesp.asmx/publishWithLink`,
        method: 'POST',
        headers: {
          cookie: filteredCookies,
          referer: `${baseUrl}/professional`,
          origin: baseUrl
        },
        data: payload
      }],
      taskName: 'CREATE_SHARE_LINK'
    });

    const { data: { d = {} } = {} } = response;

    const { link } = d;

    console.log('response of creating link', response?.data);
    return link;
  } catch (err) {
    console.log('Err while Creating Share Link', err);
    throw err;
  }
};

const HandleOldGalleries = async ({
  baseUrl,
  userEmail,
  filteredCookies
}) => {
  const galleries = (await axiosBase.post(ENDPOINTS.GALLERY.GET_GALLERIES, {
    filterParams: {
      userEmail,
      isArchived: true,
      shareLink: { $exists: false },
      $or: [
        { retryCount: { $exists: false } },
        { retryCount: { $lt: 3 } }
      ]
    }
  })).data.galleries || [];

  console.log({
    galleries: galleries.length
  })

  for (let i = 0; i < galleries.length; i += 1) {
    const gallery = galleries[i];
    const { collectionId, name } = gallery;

    console.log({
      collectionId,
      name
    });

    // Update settings & allow High-res photo downloads for the gallery
    try {
      await allowHighResDownloads({
        baseUrl,
        projectId: collectionId,
        filteredCookies
      });

      console.log('High-Res Downloads Allowed!');

      // Add client in gallery
      await addClientInGallery({
        baseUrl,
        filteredCookies,
        collectionId
      });

      console.log('Client Added In Gallery!');

      // create shareLink to share with Client
      const shareLink = await createShareLink({
        baseUrl,
        filteredCookies,
        collectionId
      });

      console.log({
        shareLink
      });

      console.log('Link Generated!');

      await retryHandler({
        fn: axiosBase.post,
        args: [ENDPOINTS.GALLERY.UPDATE_GALLERY, {
          filterParams: {
            collectionId
          },
          updateParams: {
            shareLink
          }
        }],
        taskName: 'SAVE_GALLERIES'
      });
    } catch (err) {
      console.log(`Error in Handle Old Galleries for ${collectionId}`, err);
      await retryHandler({
        fn: axiosBase.post,
        args: [ENDPOINTS.GALLERY.UPDATE_GALLERY, {
          filterParams: {
            collectionId
          },
          updateParams: {
            retryCount: 1
          }
        }],
        taskName: 'SAVE_GALLERIES'
      });
    }

    await sleep(30);
  }
};

const PerformLogin = async (userEmail, userPassword, connectConfig, proxyObject) => {
  const browser = await chrome.launch(connectConfig);
  const page = await browser.newPage();
  
  if (proxyObject) {
    await page.authenticate({ username: proxyObject.username, password: proxyObject.password }); 
    console.log('Proxy Authenticated!');
  }

  await navigateWithRetry(page, 'https://us.pic-time.com/professional#dash');

  if (page.url().includes('/login')) {

    await loginMethod({
      page,
      email: userEmail,
      password: userPassword
    });
  }

  const url = page.url();
  const baseUrl =  new URL(url).origin;

  console.log({ baseUrl });

  await navigateWithRetry(page, `${baseUrl}/professional#dash`);

  console.log('Current Url', page.url());

  const cookies = await page.cookies();

  const filteredCookies = getCookies({ cookies });

  await axiosBase.post(ENDPOINTS.ACCOUNT.UPDATE_ACCOUNT, {
    accountId,
    platform: PLATFORMS.PIC_TIME,
    authorization: filteredCookies,
    baseUrl
  });

  return { baseUrl, browser, filteredCookies };
};

export {
  handleCaptcha,
  PerformLogin,
  SaveClientGalleries,
  HandleOldGalleries
};
