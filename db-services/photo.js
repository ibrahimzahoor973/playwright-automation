import Photo from '../models/photo.js';

const SaveGalleryPhotos = async ({
  photos,
  setName
}) => {
  const writeData = photos.map((photo) => {
    const {
      collectionId,
      setId,
      galleryName,
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

    return {
      updateOne: {
        filter: {
          collectionId,
          setId,
          photoId
        },
        update: {
          $set : {
            galleryName,
            setName,
            photoId,
            photoUrl,
            xLarge,
            large,
            medium,
            thumb,
            displaySmall,
            displayMedium,
            displayLarge
          }
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

export {
  GetGalleryPhotos,
  SaveGalleryPhotos,
  UpdateGalleryPhoto
};

