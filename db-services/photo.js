import Photo from '../models/photo.js';

import PLATFORMS from '../constants.js';

const SaveGalleryPhotos = async ({
  photos,
  setName,
  userEmail,
  platform
}) => {
  const writeData = photos.map((photo) => {
    const {
      collectionId,
      setId,
      name,
      galleryName,
      setName: sceneName,
      photoId,
      photoUrl,
      xLarge,
      large,
      medium,
      thumb,
      displaySmall,
      displayMedium,
      displayLarge
    } = photo;

    let setObj = {
      galleryName,
      setName,
      name,
      platform,
      photoId,
      photoUrl,
      xLarge,
      large,
      medium,
      thumb,
      displaySmall,
      displayMedium,
      displayLarge
    };

    if (platform === PLATFORMS.PIC_TIME) {
      setObj = {
        galleryName,
        setName: sceneName,
        name,
        platform
      }
    }

    return {
      updateOne: {
        filter: {
          userEmail,
          collectionId,
          setId,
          photoId
        },
        update: {
          $set : setObj
        },
        upsert: true
      }
    }
  });
  if (writeData.length) {
    const res =  await Photo.bulkWrite(writeData);
    console.log({ SaveGalleryPhotos: res });
  }
};

const GetGalleryPhotos = async ({
  filterParams
}) => {
  const photos = await Photo.find(filterParams);
  return photos;
};


const UpdateGalleryPhoto = async ({
  filterParams,
  updateParams
}) => {
  await Photo.updateOne({
    ...filterParams
  }, {
    ...updateParams
  });
};

const UpdateGalleryPhotos = async ({
  filterParams,
  updateParams
}) => {
  await Photo.updateMany({
    ...filterParams
  }, {
    ...updateParams
  });
};


export {
  GetGalleryPhotos,
  SaveGalleryPhotos,
  UpdateGalleryPhoto,
  UpdateGalleryPhotos
};

