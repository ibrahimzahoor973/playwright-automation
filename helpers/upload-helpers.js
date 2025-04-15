import moment from 'moment';

import { axiosInstance as axios, AxiosBaseUrl } from '../config/axios.js';


import { PLATFORMS, ENDPOINTS } from '../constants.js';
import { retryHandler, sleep } from '../helpers/common.js';

const axiosBase = AxiosBaseUrl();

const {
  globalPtToken,
  pcpClientId
} = process.env;

const generateGUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const generateShortID = () => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
};

const UploadGalleryToPassGallery = async ({
  accountId,
  payload
}) => {
  return await retryHandler({
    fn: axios,
    args: [{
      url: `https://productionapi.pic-time.com/apiV2/automation/checkin?pcpClientId=${pcpClientId}&accountId=${accountId}&=`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${globalPtToken}`,
        "Content-Type": 'application/xml'
      },
      data: payload
    }],
    taskName: 'Upload Gallery To Pass Gallery'
  });
}

const CreatePayloadAndUploadGallery = async ({
  uploadAccountId,
  guid,
  galleryName,
  externalProjRef,
  eventDate,
  coverPhoto,
  subPayload,
  updateGallery,
  collectionId
}) => {
  const payload = `<action>
      <type>createProject</type>
      <globalId>${guid}</globalId>
      <name>${galleryName.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</name>
      <title>${galleryName.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</title>
      <externalProjectRef>${externalProjRef}-002</externalProjectRef>
      <coverId>1010</coverId>
      <projectCategory>General</projectCategory>
      <projectDate>${moment(eventDate).format('YYYY/MM/DD')}</projectDate>
      <expirationDate>${moment(eventDate).format('YYYY-MM-DDThh:mm:ss')}-00</expirationDate>
      <projectCover>
          <downloadUrl>${coverPhoto}</downloadUrl>
      </projectCover>
      <projectAction>
          <sendEmailOnPublish>false</sendEmailOnPublish>
          <publishWhenDone>true</publishWhenDone>
      </projectAction>
      <customer>
        <name></name>
        <email></email>
      </customer>
      <upload>
          <scenes>
             ${subPayload}
          </scenes>
      </upload>
  </action>`;

  console.log({ payload });

  await UploadGalleryToPassGallery({
    accountId: uploadAccountId,
    payload
  });

  if (updateGallery) {
    await retryHandler({
      fn: axiosBase.post,
      args: [ENDPOINTS.GALLERY.UPDATE_GALLERY, {
        filterParams: { collectionId },
        updateParams: { externalProjRef }
      }],
      taskName: 'Update Gallery Record'
    });
    
  }
};

const UploadGallery = async ({
  gallery,
  platform,
  uploadAccountId
}) => {
  const {
    collectionId,
    coverPhoto: galleryCoverPhoto,
    coverPhotoUrl,
    externalProjRef: galleryRef,
    eventDate = moment().toDate(),
    galleryName
  } = gallery;

  const coverPhoto = platform === PLATFORMS.PIC_TIME ? coverPhotoUrl : galleryCoverPhoto;

  let guid = generateGUID();
  let externalProjRef = galleryRef || `${platform}-migration-${generateShortID()}`;
  const updateGallery = !galleryRef;

  const subPayload = ``;

  await CreatePayloadAndUploadGallery({
    uploadAccountId,
    guid,
    galleryName,
    externalProjRef,
    eventDate,
    coverPhoto,
    subPayload,
    updateGallery,
    collectionId
  });
};


const CreateGalleriesInUserAccount = async ({
  uploadAccountId,
  platform,
  galleryCollections
}) => {
  try {
    if (uploadAccountId) {
      console.log({ galleryCollections });

      for (let i = 0; i < galleryCollections.length; i += 1) {
        const gallery = galleryCollections[i];

        await UploadGallery({
          gallery,
          platform,
          uploadAccountId
        });

        await sleep(10);
      }
    }

    return true;

  } catch (err) {
    console.log('Error in CreateGalleriesInUserAccount', err);
    throw err;
  }
};

export default CreateGalleriesInUserAccount;
