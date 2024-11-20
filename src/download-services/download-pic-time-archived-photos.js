import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';

import axios from '../../config/axios.js';

import { GetGalleries, UpdateGallery } from '../../db-services/gallery.js';
import { UpdateGallerySets } from '../../db-services/gallery-set.js';
import { UpdateGalleryPhotos } from '../../db-services/photo.js';

import { getCookies, sleep } from '../helpers/common.js';
import { handleCaptcha } from '../helpers/pic-time-helpers.js';

const {
  userEmail,
  platform
} = process.env;

const getUserJobId = async ({
  baseUrl,
  galleryIdentifier,
  filteredCookies
}) => {
  const response = await axios({
    url: `${baseUrl}/-${galleryIdentifier}/services.asmx/sendPhotos`,
    method: 'POST',
    headers: {
      cookie: filteredCookies
    },
    data: {
      pref: {
        boundHeight: -1,
        boundWidth: -1,
        jpgQuality: -1,
        noMobilities: true
      }
    }
  });

  const { data: { d = {} } = {} } = response;

  const { userJobId } = d;

  console.log({ userJobId });

  return userJobId;
}

const retrievePhotos = async ({
  filteredCookies,
  galleryIdentifier,
  baseUrl,
  collectionId
}) => {
  try {
    const userJobId = await getUserJobId({
      baseUrl,
      galleryIdentifier,
      filteredCookies
    });
  
    const getDownloadInfoResponse = await axios({
      url: `${baseUrl}/-${galleryIdentifier}/services.asmx/getDownloadInfo2`,
      method: 'POST',
      headers: {
        cookie: filteredCookies
      },
      data: {
          mode: 2,
          projectId: collectionId,
          userJobId
      }
    });

    const { data: { d = {} } = {} } = getDownloadInfoResponse;

    const { photosCount } = d;

    if (photosCount) {
      await UpdateGallery({
        filterParams: {
          collectionId
        },
        updateParams: {
          photosRetrieved: true,
          galleryIdentifier
        }
      });
    }
  
    console.log({ getDownloadInfoResponse: getDownloadInfoResponse.data });
  } catch (err) {
    console.log('An Error occurred in retrievePhotos', err);
    throw err;
  }
};

export const RetrieveArchivedPhotos = async ({
  page
 }) => {
  const galleries = await GetGalleries({
    filterParams: {
      userEmail,
      platform,
      isArchived: true,
      shareLink: { $exists: true },
      photosRetrieved: { $exists: false }
    }
  });

  if (galleries.length) {
    const { baseUrl } = galleries[0];

    console.log({ baseUrl });
  
    await page.goto(`${baseUrl}/account`);
  
    const cookies = await page.cookies();
  
    const filteredCookies = getCookies({ cookies });
  
    const response = await axios({
      url: `${baseUrl}/!servicesg.asmx/getGUserProjects`,
      method: 'POST',
      headers: {
        cookie: filteredCookies
      },
      data: {}
    });
  
    const { data: { d = {} } = {} } = response;
    const userProjects = d.projects_s || [];
  
    for (let i = 0; i < galleries.length; i += 1) {
      const gallery = galleries[i];
  
      console.log({
        collectionId: gallery.collectionId,
        name: gallery.name
      });
  
      const galleryProject = userProjects.find((project) => project[8]?.toString() === gallery.collectionId);
  
      console.log({ galleryProject });
      if (galleryProject) {
        const galleryIdentifier = galleryProject[6];
  
        console.log({ galleryIdentifier });
    
        await page.goto(`${baseUrl}/-${galleryIdentifier}/gallery`);
    
        await handleCaptcha({ page });
    
        await retrievePhotos({
          filteredCookies,
          galleryIdentifier,
          baseUrl,
          collectionId: gallery.collectionId
        });
      }
      await sleep(15);
    }
  }
};

const checkIfPhotosAreReadyToDownload = async ({
  baseUrl,
  galleryIdentifier,
  filteredCookies,
  collectionId,
  userJobId
}) => {
  const response = await axios({
    url: `${baseUrl}/-${galleryIdentifier}/services.asmx/getDownloadInfo2`,
    method: 'POST',
    headers: {
      cookie: filteredCookies
    },
    data: {
      mode: 1,
      projectId: collectionId,
      userJobId
    }
  });

  const { data: { d = {} } = {} } = response;
  const { status } = d;

  console.log({ status });

  return status === 20 ? true : false;
}

export const DownloadRetrievedPhotos = async ({
  page
 }) => {
  const galleries = await GetGalleries({
    filterParams: {
      userEmail,
      platform,
      isArchived: true,
      photosRetrieved: true,
      isDownloaded: { $exists: false }
    }
  });

  if (galleries.length) {
    const { baseUrl } = galleries[0];

    console.log({ baseUrl });
  
  
    for (let i = 0; i < galleries.length; i += 1) {
      const gallery = galleries[i];
      const {
        collectionId,
        galleryIdentifier,
        name: galleryName
      } = gallery;
  
      await page.goto(`${baseUrl}/-${galleryIdentifier}/gallery`);
  
      const cookies = await page.cookies();
  
      const filteredCookies = getCookies({ cookies });
      await handleCaptcha({ page });
  
      const userJobId = await getUserJobId({
        baseUrl,
        galleryIdentifier,
        filteredCookies
      });
  
      console.log({ userJobId });
  
      const arePhotosReady = await checkIfPhotosAreReadyToDownload({
        baseUrl,
        galleryIdentifier,
        filteredCookies,
        collectionId,
        userJobId
      });
  
      console.log({ arePhotosReady });
  
      if (arePhotosReady) {
        const downloadUrl = `${baseUrl}/-${galleryIdentifier}/download?mode=hireszip&userjobid=${userJobId}&photoid=&slideshowid=&disposition=&productid=&featuredvideoid=&highestcategorypossible=true&batchsize=1200&startindex=0`;
        const downloadStreamResponse = await axios({
          url: downloadUrl,
          method: 'GET',
          headers: {
            cookie: filteredCookies
          },
          responseType: 'stream'
        });
  
        const temporaryPath = path.join(process.cwd(), 'photos.zip');
  
        await new Promise((resolve, reject) => {
          const writer = fs.createWriteStream(temporaryPath);
          downloadStreamResponse.data.pipe(writer);
          writer.on('data', () => {
            console.log('File is being Downloaded!');
            resolve();
          });
          writer.on('finish', () => {
            console.log('Finished writing file!');
            resolve();
          });
          writer.on('error', () => {
            console.log('Error While Writing Stream!');
            reject();
        });
        });
  
        const directoryPath = path.join(process.cwd(), `Pic-Time/${userEmail}/${galleryName}`);
  
  
        const zip = new AdmZip(temporaryPath);
        zip.extractAllTo(directoryPath, true);
    
        fs.unlinkSync(temporaryPath);
    
        console.log(`Files extracted to: ${directoryPath}`);
  
        await UpdateGallery({
          filterParams: {
            collectionId
          },
          updateParams: {
            isDownloaded: true
          }
        });
  
        await UpdateGallerySets({
          filterParams: {
            collectionId
          },
          updateParams: { isDownloaded: true }
        });
  
        await UpdateGalleryPhotos({
          filterParams: {
            collectionId
          },
          updateParams: { isDownloaded: true }
        })
      } else {
        console.log(`Photos are not yet Ready for ${galleryName}`);
      }
      await sleep(15);
    }
  }
};