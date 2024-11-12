import axios from '../../config/axios.js';

import { GetGalleries as GetGalleriesFromDb, SaveGalleries, UpdateGallery } from '../../db-services/gallery.js';
import { SaveGallerySets, UpdateGallerySets } from '../../db-services/gallery-set.js';
import { SaveGalleryPhotos } from '../../db-services/photo.js';

const { userEmail, platform } = process.env;

const parseClientGalleries = ({
  galleriesData
}) => {
  const galleries = galleriesData.map((gallery) => ({
    collectionId: gallery[9] || '',
    galleryName: gallery[7] || '',
    numberOfPhotos: gallery[8] || 0,
    eventDate: gallery[6] || ''
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

  await SaveGalleries({
    galleries,
    userEmail,
    platform
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

