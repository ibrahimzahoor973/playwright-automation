import { axiosInstance as axios, AxiosBaseUrl } from '../config/axios.js';

import { generateGUID, navigateWithRetry } from '../src/helpers/common.js';

import { ENDPOINTS } from '../constants.js';

import CreateGalleriesInUserAccount from './upload-helpers.js';

const { platform } = process.env;

const axiosBase = AxiosBaseUrl();


const getGalleryCollections = async ({
  galleries,
  filteredCookies
}) => {
  console.log('in getGalleryCollections');
  const galleryCollections = [];
  for (let i = 0; i < galleries.length; i += 1) {
    const collection = galleries[i];
    const tagResponse = await axios({
      url: `https://galleries.pixieset.com/api/v1/collections/${collection.id}/edit`,
      method: 'GET',
      headers: {
        'content-type': 'application/json, text/plain, */*',
        cookie: filteredCookies
      }
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
        platform
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
      response = await axios({
        url: 'https://galleries.pixieset.com/api/v1/dashboard_listings',
        method: 'GET',
        headers: {
          cookie: filteredCookies
        },
        params: {
          page: pageNumber
        }
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
    await axiosBase.post(ENDPOINTS.GALLERY.SAVE_GALLERY, {
      galleries: galleryCollections,
      platform,
      pageNumber,
      accountId
    });

    galleries.push(...galleryCollections);

    console.log({ lastPage, pageNumber });
  
    await CreateGalleriesInUserAccount({
      accountId,
      platform
    });

    while (lastPage !== pageNumber) {
      pageNumber += 1;
      const response = await axios({
        url: 'https://galleries.pixieset.com/api/v1/dashboard_listings?page=1',
        method: 'GET',
        headers: {
          'content-type': 'application/json',
          cookie: filteredCookies
        },
        params: {
          page: pageNumber
        }
      });

      const { data } = response?.data || {};
      const { data: galleriesData } = data || {};
      const { collections } = galleriesData || {};

      galleryCollections = await getGalleryCollections({ galleries: collections, filteredCookies });

      await axiosBase.post(ENDPOINTS.GALLERY.SAVE_GALLERY, {
        galleries: galleryCollections,
        platform,
        pageNumber,
        accountId
      });

      galleries.push(...galleryCollections);

      await CreateGalleriesInUserAccount({
        accountId,
        platform
      });
    }

    await axiosBase.post(ENDPOINTS.GALLERY.UPDATE_GALLERY, {
      filterParams: {
        accountId,
        platform,
        collectionId: galleries[galleries.length - 1]?.collectionId
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
        platform,
        allGalleriesSynced: true
      },
      limit: 1
    })).data.galleries || [];
    if (gallery) {
      // need next processing
    } else {
      collections = await GetGalleries({ filteredCookies, accountId });
    }

    console.log({ collections: collections.length });

    return true;
  } catch (err) {
    console.log('Error in GetClientsGallery method', err);
    throw err;
  }
};

export default GetClientsGallery;
