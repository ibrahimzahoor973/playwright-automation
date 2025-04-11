import moment from 'moment';

import { axiosInstance as axios, AxiosBaseUrl } from '../config/axios.js';

import { GetAccount } from '../db-services/account.js';


import { PLATFORMS, ENDPOINTS } from '../../constants.js';
import { sleep } from './common.js';

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
  const response = await axios({
    url: `https://productionapi.pic-time.com/apiV2/automation/checkin?pcpClientId=${pcpClientId}&accountId=${accountId}&=`,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${globalPtToken}`,
      "Content-Type": 'application/xml'
    },
    data: payload
  });

  return response;
}

const CreatePayloadAndUploadGallery = async ({
  accountId,
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
      <upload>
          <scenes>
             ${subPayload}
          </scenes>
      </upload>
  </action>`;

  await UploadGalleryToPassGallery({
    accountId,
    payload
  });

  if (updateGallery) {
    await axiosBase.post(ENDPOINTS.GALLERY.UPDATE_GALLERY, {
      filterParams: {
        collectionId
      },
      updateParams: {
        externalProjRef
      }
    });
  }
};

const UploadGallery = async ({
  gallery,
  platform,
  accountId
}) => {
  const {
    collectionId,
    coverPhoto: galleryCoverPhoto,
    coverPhotoUrl,
    externalProjRef: galleryRef,
    eventDate = moment().toDate(),
    name: galleryName
  } = gallery;

  const coverPhoto = platform === PLATFORMS.PIC_TIME ? coverPhotoUrl : galleryCoverPhoto;

  let guid = generateGUID();
  let externalProjRef = galleryRef || `${platform}-migration-${generateShortID()}`;
  const updateGallery = !galleryRef;

  const subPayload = ``;

  await CreatePayloadAndUploadGallery({
    accountId,
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
  userEmail,
  platform
}) => {
  try {
    let accountId;

    console.log({
      userEmail,
      platform
    });

    const account = await axios.post(ENDPOINTS.ACCOUNT.GET_ACCOUNT, {
      email: userEmail,
      platform,
      uploadScriptAccount: true
    }).data.account;;

    console.log({
      account
    });

    if (account) {
      const { passGalleryAccountId } = account;
      console.log({
        passGalleryAccountId
      })
      accountId = passGalleryAccountId;
    }

    if (accountId) {
      const galleries = await axiosBase.post(ENDPOINTS.GALLERY.GET_GALLERIES, {
        filterParams: {
          userEmail,
          platform,
          galleryUploaded: { $exists: false }
        }
      }).data.galleries || [];;

      console.log({ galleries: galleries });

      for (let i = 0; i < galleries.length; i += 1) {
        const gallery = galleries[i];

        await UploadGallery({
          gallery,
          platform,
          accountId
        });

        await axiosBase.post(ENDPOINTS.GALLERY.UPDATE_GALLERY, {
          filterParams: {
            _id: gallery._id,
          },
          updateParams: {
            galleryUploaded: true
          }
        });

        await sleep(30);
      }
    }

    return true;

  } catch (err) {
    console.log('Error in CreateGalleriesInUserAccount', err);
    throw err;
  }
};

export default CreateGalleriesInUserAccount;
