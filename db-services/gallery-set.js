import pkg from 'lodash';

import GallerySet from '../models/gallery-set.js';

import { sleep } from '../src/helpers/common.js';

import { PLATFORMS } from '../constants.js';

const { chunk } = pkg;

const SaveGallerySets = async ({
  gallerySets: gallerySetsData,
  galleryName,
  userEmail,
  platform
}) => {
  let collectionId;
  let setId;
  let numberOfPhotos;
  let name;
  let subsetIds;

  const gallerySetsChunks = chunk(gallerySetsData, 200);

  console.log({ gallerySetsChunks: gallerySetsChunks.length });


  for (let i = 0; i < gallerySetsChunks.length; i += 1) {
    const gallerySets = gallerySetsChunks[i];

    const writeData = gallerySets.map((set) => {
      if (platform === PLATFORMS.PIXIESET) {
        const {
          collection_id,
          id,
          photo_count,
          name: setName
        } = set;
  
        collectionId = collection_id;
        setId = id;
        numberOfPhotos = photo_count;
        name = setName
      } else if (platform === PLATFORMS.PIC_TIME) {
        const {
          galleryId,
          sceneId,
          name: setName
        } = set;
  
        collectionId = galleryId;
        setId = sceneId;
        name = setName
      } else if (platform === PLATFORMS.SHOOTPROOF) {
        const {
          photoCount,
          collectionId: galleryId,
          setId: id,
          subAlbumIds,
          name: setName
        } = set;
        collectionId = galleryId;
        setId = id;
        numberOfPhotos = photoCount;
        name = setName;
        subsetIds = subAlbumIds;
      }
  
      return {
        updateOne: {
          filter: {
            userEmail,
            setId
          },
          update: {
            $set: {
              collectionId,
              galleryName,
              numberOfPhotos,
              name,
              platform,
              subsetIds
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
          const res = await GallerySet.bulkWrite(writeData);
          console.log({ SaveGallerySets: res });
          break;
        } catch (err) {
          console.log('Error in Save Galleries Sets Bulk Write', err);
          retries -=1;

          if (retries === 0) {
            throw err;
          }
        
        console.log(`Retrying... attempts left: ${retries}`);

        await sleep(5);
      }
    }
  }
}};

const UpdateGallerySet = async ({
  filterParams,
  updateParams
}) => {
  await GallerySet.updateOne({
    ...filterParams
  }, {
    ...updateParams
  });
};

const UpdateGallerySets = async ({
  filterParams,
  updateParams
}) => {
  await GallerySet.updateMany({
    ...filterParams
  }, {
    ...updateParams
  });
};


const GetGallerySets = async ({
  filterParams
}) => {
  const gallerySets = await GallerySet.find(filterParams);
  return gallerySets;
};


export {
  GetGallerySets,
  SaveGallerySets,
  UpdateGallerySet,
  UpdateGallerySets
};

