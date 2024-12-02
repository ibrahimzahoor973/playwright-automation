import unzipper from 'unzipper';
import fs from 'fs';
import path from 'path';
import https from 'https';

import axios from '../../config/axios.js';

import { GetGalleries, UpdateGallery } from '../../db-services/gallery.js';
import { UpdateGallerySets } from '../../db-services/gallery-set.js';
import { UpdateGalleryPhotos } from '../../db-services/photo.js';

import { getCookies, navigateWithRetry, sleep } from '../helpers/common.js';
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
      photosRetrieved: { $exists: false },
      $or: [
        { retryCount: { $exists: false } },
        { retryCount: { $lt: 3 } }
      ]
    }
  });

  if (galleries.length) {
    const { baseUrl } = galleries[0];

    console.log({ baseUrl });

    await navigateWithRetry(page, `${baseUrl}/account`)

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

    console.log('userProjects', userProjects.length);

    if (userProjects.length) {
      for (let i = 0; i < galleries.length; i += 1) {
        const gallery = galleries[i];

        console.log({
          collectionId: gallery.collectionId,
          name: gallery.name
        });

        const galleryProject = userProjects.find((project) => project[8]?.toString() === gallery.collectionId);

        console.log({ galleryProject });

        try {
          if (galleryProject) {
            const galleryIdentifier = galleryProject[6];
    
            console.log({ galleryIdentifier });
    
            await navigateWithRetry(page, `${baseUrl}/-${galleryIdentifier}/gallery`);
    
            await handleCaptcha({ page });
    
            await retrievePhotos({
              filteredCookies,
              galleryIdentifier,
              baseUrl,
              collectionId: gallery.collectionId
            });
          } else if (gallery.shareLink){
            await navigateWithRetry(page, gallery.shareLink);
            
            await sleep(10);

            const url = page.url();

            const match = url.match(/\/([^\/]+)\/gallery/);
            let galleryIdentifier;
            if (match) {
              galleryIdentifier = match[1]; 
              galleryIdentifier = galleryIdentifier.replace(/^-/,'');
              console.log(galleryIdentifier);
            } else {
              console.log("No match found");
            }

            await handleCaptcha({ page });
    
            await retrievePhotos({
              filteredCookies,
              galleryIdentifier,
              baseUrl,
              collectionId: gallery.collectionId
            });
          } else {
            await UpdateGallery({
              filterParams: {
                collectionId: gallery.collectionId,
                $or: [
                  { retryCount: { $exists: false } },
                  { retryCount: { $lt: 3 } }
                ]
              },
              updateParams: {
                retryCount: 1,
                errorMessage: `Gallery Project doesn't exists on client's account`
              }
            });
          }
        } catch (err) {
          console.log(`Error while Retrieving Photos for ${gallery.collectionId}`, err);
          await UpdateGallery({
            filterParams: {
              collectionId: gallery.collectionId
            },
            updateParams: {
              retryCount: 1,
              errorMessage: err?.message || 'Unknown Reason'
            }
          });
        }
        await sleep(15);
      }
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

  console.log({ galleryIdentifier, status });

  return status === 20 ? true : false;
}

export const DownloadRetrievedPhotos = async ({
  page
}) => {
  try {
    axios.defaults.httpsAgent = new https.Agent({ keepAlive: true });

    const galleries = await GetGalleries({
      filterParams: {
        userEmail,
        platform,
        isArchived: true,
        photosRetrieved: true,
        isDownloaded: { $exists: false },
        $or: [
          { retryCount: { $exists: false } },
          { retryCount: { $lt: 3 } }
        ]
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

        console.log({ collectionId, galleryName });

        await navigateWithRetry(page, `${baseUrl}/-${galleryIdentifier}/gallery`);

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

        try {
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
  
            // const directoryPath = path.join(process.cwd(), `${userEmail}/photos.zip`);
            // const temporaryPath = path.join('D:', `${userEmail}/photos.zip`);
  
            const directoryPath = path.join('D:', `Pic-Time/${userEmail}/${galleryName}-${collectionId}.zip`);
  
            const directory = path.dirname(directoryPath);
          
            if (!fs.existsSync(directory)) {
                fs.mkdirSync(directory, { recursive: true });
            }
  
            console.log('Starting download...');
            await new Promise((resolve, reject) => {
              const writer = fs.createWriteStream(directoryPath);
              downloadStreamResponse.data.pipe(writer);
  
              writer.on('finish', () => {
                console.log('Finished writing file to', directoryPath);
                resolve();
              });
  
              writer.on('error', (err) => {
                console.error('Error while writing the file:', err);
                reject(err);
              });
            });
  
            // const directoryPath = path.join(process.cwd(), `Pic-Time/${userEmail}/${galleryName}`);
  
            // // const directoryPath = path.join('D:', `Pic-Time/${userEmail}/${galleryName}`);
            // if (!fs.existsSync(directoryPath)) {
            //   fs.mkdirSync(directoryPath, { recursive: true });
            // }
  
            // // Step 3: Extract the ZIP file
            // console.log('Starting to extract the ZIP file...');
            // await new Promise((resolve, reject) => {
            //   fs.createReadStream(temporaryPath)
            //     .pipe(unzipper.Extract({ path: directoryPath }))
            //     .on('close', () => {
            //       console.log('Extraction completed!');
            //       resolve();
            //     })
            //     .on('error', (err) => {
            //       console.error('Error while extracting the ZIP file:', err);
            //       reject(err);
            //     });
            // });
            // fs.unlinkSync(temporaryPath);
  
            // console.log(`Files extracted to: ${directoryPath}`);
  
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
        } catch (err) {
          console.log(`Error While Downloading Gallery ${collectionId}`, err);
          await UpdateGallery ({
            filterParams: {
              collectionId
            },
            updateParams: {
              error: err?.message || 'Unknown Error',
              retryCount: 1
            }
          });
        }
        await sleep(15);
      }
    }
  } catch (err) {
    console.log('Error in Download Pic-time Archived Photos!', err);
    throw err;
  }
};