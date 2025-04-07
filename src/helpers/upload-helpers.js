import moment from 'moment';
import pkg from 'lodash';

import axios from '../../config/axios.js';

import { CreateAccount, GetAccount, UpdateAccount } from '../../db-services/account.js';
import { GetClients } from '../../db-services/client.js';
import { GetGalleries, UpdateGallery } from '../../db-services/gallery.js';
import { GetGallerySets, UpdateGallerySet, UpdateGallerySets } from '../../db-services/gallery-set.js';
import { GetGalleryPhotos, UpdateGalleryPhotos } from '../../db-services/photo.js';


import { PLATFORMS } from '../../constants.js';
import { sleep } from './common.js';

const { chunk, groupBy, map } = pkg;

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

const GetUploadedProjects = async ({
  filteredCookies,
  accountId
}) => {
  console.log({
    accountId
  });
  const response = await axios({
    url: 'https://cstool.passgallery.com/!servicescs.asmx/findAccountProjects',
    method: 'POST',
    headers: {
      cookie: filteredCookies
    },
    data: {
      accountId,
      projectIdsStr: '*'
    }
  });

  console.log('response', response.data.d);
  console.log('response', response.data.d.projects[0]);

  const { data: { d } = {} = {} } = response;

  const alreadyUploadedGalleries = d.projects.map(project => project.title);
  console.log({
    alreadyUploadedGalleries
  });
  return alreadyUploadedGalleries;
}

const GetAccountId = async ({ filteredCookies, userEmail }) => {
  try {
    const response = await axios({
      url: 'https://cstool.passgallery.com/!servicescs.asmx/lookUpPhotographerAccount',
      method: 'POST',
      headers: {
        cookie: filteredCookies
      },
      data: {
        id: userEmail,
        idType: '1'
      }
    });

    console.log({
      response: response.data
    });

    const { data: { d = {} } = {} } = response || {};

    console.log({ d });
    const { id } = d || {};

    console.log({ id });

    return id;
  } catch (err) {
    console.log('Error in GetAccountId', err);
    throw err;
  }
};

const UploadGalleryPhotos = async ({
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
  name,
  email,
  subPayload,
  photoIds,
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
          <name>${name}</name>
          <email>${email}</email>
      </customer>
      <upload>
          <scenes>
             ${subPayload}
          </scenes>
      </upload>
  </action>`;

  await UploadGalleryPhotos({
    accountId,
    payload
  });

  if (updateGallery) {
    await UpdateGallery({
      filterParams: {
        collectionId
      },
      updateParams: {
        externalProjRef
      }
    });
  }

  await UpdateGalleryPhotos({
    filterParams: {
      photoId: { $in: photoIds }
    },
    updateParams: {
      isUploaded: true
    }
  });

};

const UploadGallery = async ({
  gallery,
  platform,
  accountId
}) => {
  let coverPhoto;
  const {
    collectionId,
    coverPhoto: galleryCoverPhoto,
    coverPhotoUrl,
    externalProjRef: galleryRef,
    eventDate = moment().toDate(),
    name: galleryName,
    isArchived = false
  } = gallery;

  const clients = await GetClients({
    filterParams: {
      collectionId
    }
  });

  const gallerySets = await GetGallerySets({
    filterParams: {
      collectionId,
      isUploaded: { $exists: false }
    }
  });

  if (platform === PLATFORMS.PIC_TIME) {
    coverPhoto = coverPhotoUrl;
  } else {
    coverPhoto = galleryCoverPhoto;
  }


  console.log({
    coverPhoto
  });

  const photos = await GetGalleryPhotos({
    filterParams: {
      collectionId,
      isDownloaded: true,
      isUploaded: { $exists: false },
      filePath: { $exists: true }
    }
  });

  console.log({
    galleryPhotos: photos.length
  })

  let setsAndPhotos;

  if (platform === PLATFORMS.SHOOTPROOF || platform === PLATFORMS.ZENFOLIO) {
    const groupedPhotos = groupBy(photos, 'setName');
    console.log({
      collectionId,
      groupedPhotos
    });
    setsAndPhotos = map(groupedPhotos, (items, setName) => {
      const item = items.find((item) => item.setName === setName);

      return {
        setId: item?.setId || null,
        [setName]: items
      }
    });
  } else {
    setsAndPhotos = gallerySets.map((set) => {
      const { setId, name } = set;
      const setPhotos = photos.filter((photo) => photo.setId === setId);
      return {
        setId,
        [name]: setPhotos
      }
    });
  }

  console.log({
    setsAndPhotos
  });

  let updateGallery = false;
  let guid;
  let externalProjRef = galleryRef;
  if (!externalProjRef) {
    console.log('Gallery ref not found');
    externalProjRef = `${platform}-migration-${generateShortID()}`;
    updateGallery = true;
  }

  let expirationDate = moment().add(2, 'years');

  if (moment(eventDate).add(2, 'years').isAfter(moment())) {
    expirationDate = moment(eventDate).add(2, 'years');
  }

  console.log({
    guid,
    externalProjRef,
    expirationDate
  });

  const {
    name = '',
    email = ''
  } = clients[0] || {};

  console.log({
    name,
    email
  });

  let count = 0;
  let subPayload = ``;
  let photoPayload = ``;
  let gallerySetId;
  let photoIds = [];
  let setIds = [];
  let notFoundPhotoIds = [];

  console.log({
    setsAndPhotos: setsAndPhotos.length
  })

  for (let i = 0; i < setsAndPhotos.length; i += 1) {
    photoPayload = ``;
    const setAndPhotos = setsAndPhotos[i];

    const { setId } = setAndPhotos;
    setIds.push(setId);
    gallerySetId = setId;
    console.log({
      setId
    });

    delete setAndPhotos.setId;
    const setName = Object.keys(setAndPhotos)[0];
    const setPhotos = Object.values(setAndPhotos)[0];

    console.log({
      setAndPhotos
    });

    console.log('setName', setName);

    console.log({
      count,
      isArchived
    });

    setPhotos.forEach((photo) => {
      // console.log({ photoPath: !isArchived ? photo.filePath : photo.filePath+'/'+setName+'/'+photo.name });
      let exists;
      if (!isArchived) {
        exists = fs.existsSync(photo.filePath);
      } else {
        exists = fs.existsSync(photo.filePath + '/' + setName + '/' + photo.name);
      }

      if (exists) {
        photoPayload += `<photo>
              <clientRemotePath>${!isArchived
          ? photo.filePath.replace(/&/g, '&amp;').replace(/</g, '&lt;')
          : (photo.filePath + '/' + setName + '/' + photo.name)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        }</clientRemotePath>
              <width>0</width>
              <height>0</height>
              <lastModified>${moment(photo.updatedAt).format('YYYY-MM-DD hh:mm:ss')}</lastModified>
              </photo>\n`;
        photoIds.push(photo.photoId);
      } else {
        console.log('File Does not Exist');
        notFoundPhotoIds.push(photo.photoId);
      }
    });

    console.log({
      photoPayload
    });

    subPayload += `<scene>
                <allowRevisionUpload>true</allowRevisionUpload>
                <name>${setName.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</name>
                <uploadRequest>
                   ${photoPayload}
                </uploadRequest>
            </scene>\n`
    console.log('In else ');
    guid = generateGUID();
    await CreatePayloadAndUploadGallery({
      accountId,
      guid,
      galleryName,
      externalProjRef,
      eventDate,
      coverPhoto,
      name,
      email,
      subPayload,
      photoIds,
      updateGallery,
      collectionId
    });

    if (notFoundPhotoIds.length) {
      await UpdateGallery({
        filterParams: {
          collectionId
        },
        updateParams: {
          error: 'Photos does not exist in System'
        },
        unsetParams: {
          isDownloaded: 1
        }
      });

      await UpdateGallerySet({
        filterParams: {
          collectionId,
          setId
        },
        updateParams: {
          error: 'Photos does not exist in System'
        },
        unsetParams: {
          isDownloaded: 1
        }
      });

      await UpdateGalleryPhotos({
        filterParams: {
          photoId: { $in: notFoundPhotoIds },
        },
        updateParams: {
          error: 'Photo does not exist in System'
        },
        unsetParams: {
          isDownloaded: 1,
          filePath: 1
        }
      });
    } else {
      await UpdateGallerySets({
        filterParams: {
          setId: { $in: setIds }
        },
        updateParams: {
          isUploaded: true
        }
      });
    }

    photoIds = [];
    notFoundPhotoIds = [];
    setIds = [];
    subPayload = ``;
    photoPayload = ``;
    count = 0;
    console.log('gallerySetId', gallerySetId);
  }

  if (subPayload) {
    console.log('Payload exists');
    guid = generateGUID();
    await CreatePayloadAndUploadGallery({
      accountId,
      guid,
      galleryName,
      externalProjRef,
      eventDate,
      coverPhoto,
      name,
      email,
      subPayload,
      photoIds,
      updateGallery,
      collectionId
    });

    await UpdateGallerySets({
      filterParams: {
        setId: { $in: setIds }
      },
      updateParams: {
        isUploaded: true
      }
    });

    photoIds = [];
    setIds = [];
    subPayload = ``;
    photoPayload = ``;
    count = 0;
  } else {
    console.log('Payload Completed');
  }
};

const CreateGalleriesInUserAccount = async ({
  filteredCookies,
  userEmail,
  platform
}) => {
  try {
    let accountId;

    console.log({
      userEmail,
      platform
    });

    const account = await GetAccount({
      filterParams: {
        email: userEmail,
        platform,
        uploadScriptAccount: true
      }
    });

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

    if (!accountId) {
      accountId = await GetAccountId({
        filteredCookies,
        userEmail
      });

      console.log({
        accountId
      });

      await UpdateAccount({
        filterParams: {
          email: userEmail,
          platform,
          uploadScriptAccount: true
        },
        updateParams: {
          passGalleryAccountId: accountId
        }
      });
    }

    if (accountId) {

      const galleries = await GetGalleries({
        filterParams: {
          userEmail,
          platform,
          galleryUploaded: { $exists: false }
        }
      });

      console.log({ galleries: galleries.length });

      for (let i = 0; i < galleries.length; i += 1) {
        const gallery = galleries[i];

        await UploadGallery({
          gallery,
          platform,
          accountId
        });

        await UpdateGallery({
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
