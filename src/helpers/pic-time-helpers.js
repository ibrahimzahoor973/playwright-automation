import moment from 'moment';

import axios from '../../config/axios.js';

import { GetGalleries as GetGalleriesFromDb, SaveGalleries, UpdateGalleries, UpdateGallery } from '../../db-services/gallery.js';
import { SaveGallerySets, UpdateGallerySets } from '../../db-services/gallery-set.js';
import { SaveGalleryPhotos } from '../../db-services/photo.js';
import { sleep } from './common.js';

const {
  userEmail,
  platform,
  clientName,
  clientEmail
} = process.env;

const parseClientGalleries = ({
  galleriesData
}) => {
  const galleries = galleriesData.map((gallery) => ({
    collectionId: gallery[9] || '',
    galleryName: gallery[7] || '',
    numberOfPhotos: gallery[8] || 0,
    eventDate: gallery[6] || '',
    createdDate: gallery[4] || null,
    offline: gallery[0] === 15 ? true: false
  }));

  console.log({
    galleries
  });

  return galleries;
};

const parseGallerySets = ({
  setsData,
  galleryId
}) => {
  const gallerySets = setsData.map((gallery) => ({
    name: gallery[0] || '',
    sceneId: gallery[1] || '',
    galleryId
  }));

  console.log({
    gallerySets
  });

  return gallerySets;
};

const parseGalleryPhotos = ({
  photosData,
  setsData,
  collectionId,
  galleryName
}) => {
  const galleryPhotos = photosData.map((gallery) => {
    const setId = gallery[4] || '';
    const set = setsData.find((set) => set.sceneId === setId);
    const { name: setName } = set || {};
    return {
      name: gallery[0] || '',
      photoId: gallery[1] || '',
      setId,
      collectionId,
      galleryName,
      setName
    }
  });

  console.log({
    galleryPhotos
  });

  return galleryPhotos;
};


export const GetGalleries = async ({
  baseUrl,
  filteredCookies
}) => {
  const response = await axios({
    url: `${baseUrl}/!servicesp.asmx/dashboard`,
    method: 'POST',
    headers: {
      cookie: filteredCookies,
      "Content-Type": 'application/json; charset=UTF-8'
    }
  });

  const { data: { d = {} } = {} } = response;
  const galleriesData = d.projects_s || [];

  const galleries = parseClientGalleries({ galleriesData });

  const oldGalleries = galleries.filter((gallery) => moment(gallery.createdDate).add(1, 'year').isBefore(moment()));


  console.log('galleries:', galleries.length);

  console.log('oldGalleries:', oldGalleries.length);

  await SaveGalleries({
    galleries,
    userEmail,
    platform,
    baseUrl
  });

  const oldGalleryIds = oldGalleries.map((gallery) => gallery.collectionId);

  // old galleries marked as archived
  await UpdateGalleries({
    filterParams: {
      userEmail,
      collectionId: { $in: oldGalleryIds },
      platform
    },
    updateParams: {
      isArchived: true
    }
  });

  await UpdateGallery({
    filterParams: {
      userEmail,
      platform,
      collectionId: galleries[galleries.length - 1]?.collectionId
    },
    updateParams: {
      allGalleriesSynced: true
    }
  });
};

export const GetSetsAndPhotos = async ({
  baseUrl,
  filteredCookies
}) => {
  try {
    let [gallery] = await GetGalleriesFromDb({
      filterParams: {
        userEmail,
        platform,
        allGalleriesSynced: true
      },
      limit: 1
    });
  
    if (!gallery) {
     await GetGalleries({
      baseUrl,
      filteredCookies
      });
    }

    const galleries = await GetGalleriesFromDb({
      filterParams: {
        userEmail,
        platform,
        gallerySetsSynced: { $exists: false }
      }
    }); 
  
    for (let i = 0; i < galleries.length; i += 1) {
      const gallery = galleries[i];
  
      const response = await axios({
        url: `${baseUrl}/!servicesp.asmx/projectPhotos2`,
        method: 'POST',
        headers: {
          cookie: filteredCookies,
          "Content-Type": 'application/json; charset=UTF-8'
        },
        data: {
          projectId: gallery.collectionId,
          photoIds: null
        }
      });
  
      const { data: { d = {} } = {} } = response;

      const setsData = d.scenes_s || [];
      const photosData = d.photos_s || [];
    
      const gallerySets = parseGallerySets({
        setsData,
        galleryId: gallery.collectionId
      });
    
      if (gallerySets.length) {
        await SaveGallerySets({
          gallerySets,
          galleryName: gallery.name,
          userEmail,
          platform
        });
      }
  
    const galleryPhotos = await parseGalleryPhotos({
      photosData,
      setsData: gallerySets,
      collectionId: gallery.collectionId,
      galleryName: gallery.name
    });
  
    await SaveGalleryPhotos({
      photos: galleryPhotos,
      userEmail,
      platform
    });

    await UpdateGallery({
      filterParams: {
        userEmail,
        collectionId: gallery.collectionId
      },
      updateParams: {
        gallerySetsSynced: true,
        photosSynced: true
      }
    });

    await UpdateGallerySets({
      filterParams: {
        userEmail,
        collectionId: gallery.collectionId
      },
      updateParams: {
        photosSynced: true
      }
    });
  }
  } catch (err) {
    console.log('Error in GetSetsAndPhotos ', err);
    throw err;
  }
};

export const handleCaptcha = async ({ page }) => {
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
    const res = await axios({
      url: `${baseUrl}/!servicesp.asmx/savePackage`,
      method: 'POST',
      headers: {
        cookie: filteredCookies
      },
      data: payload
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

    const response = await axios({
      url: `${baseUrl}/!servicesp.asmx/savePackage`,
      method: 'POST',
      headers: {
        cookie: filteredCookies,
        referer: `${baseUrl}/professional`,
        origin: baseUrl
      },
      data: payload
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

    const response = await axios({
      url: `${baseUrl}/!servicesp.asmx/publishWithLink`,
      method: 'POST',
      headers: {
        cookie: filteredCookies,
        referer: `${baseUrl}/professional`,
        origin: baseUrl
      },
      data: payload
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

export const HandleOldGalleries = async ({
  baseUrl,
  filteredCookies
}) => {
  const galleries = await GetGalleriesFromDb({
    filterParams: {
      userEmail,
      isArchived: true,
      shareLink: { $exists: false },
      $or: [
        { retryCount: { $exists: false } },
        { retryCount: { $lt: 3 } }
      ]
    }
  });

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
    
        await UpdateGallery({
          filterParams: {
            collectionId
          },
          updateParams: {
            shareLink
          }
        });
      } catch (err) {
        console.log(`Error in Handle Old Galleries for ${collectionId}`, err);
        await UpdateGallery({
          filterParams: {
            collectionId
          },
          updateParams: {
            retryCount: 1
          }
        });
      }

  await sleep(30);
  }
};

