import https from 'https';
import path from 'path';
import AdmZip from 'adm-zip';
import fs from 'fs';

import axios from '../../config/axios.js';

import { GetGallerySets, UpdateGallerySet } from '../../db-services/gallery-set.js';
import { GetGalleries, UpdateGallery } from '../../db-services/gallery.js';
import { GetGalleryPhotos, UpdateGalleryPhotos } from '../../db-services/photo.js';

import { sleep } from '../helpers/common.js';

const BASE_DELAY_MS = 180;
let retries = 3;

const { platform } = process.env;

const DownloadSetPhotos = async ({
  collectionId,
  photoIds,
  galleryName,
  setName,
  baseUrl,
  filteredCookies,
  userEmail
}) => {
  try {
    console.log('in DownloadPhoto method', photoIds);

    const payload = {
      saveBatch: {
        projectCreate: {
          newProjectIds: [],
          newSceneIds: [],
          newSelectionIds: []
        },
        projectProps: [],
        artPricing: [],
        projectSelectionProps: [],
        projectScenesProps: [],
        projectSelections: [],
        campaignsUpdate: [],
        projectExport: [{
          projectId: collectionId,
          target: '',
          message: '',
          width: -1,
          height: -1,
          quality: -1,
          photoIds,
          ticketFields: [],
          type: 'download'
        }],
        projectComments: [],
        setupPricing: [],
        setupBrand: [],
        setupAccount: [],
        actions: {
          publish: [],
          sceneReorder: [],
          photosReorder: []
        },
        dtoRevision: 30,
        ignoreDtoRevision: false
      },
      pcpClientId: ''
    }

    const savePackageResponse = await axios({
      url: `${baseUrl}/!servicesp.asmx/savePackage`,
      method: 'POST',
      headers: {
        cookie: filteredCookies
      },
      data: payload
    });

    const { data: { d: { newExports = [] } = {} } = {} } = savePackageResponse;

    const [{ userJobId }] = newExports;

    console.log({ userJobId });

    const getDownloadInfoResponse = await axios({
      url: `${baseUrl}/!servicesp.asmx/getDownloadInfo`,
      method: 'POST',
      headers: {
        cookie: filteredCookies
      },
      data: {
        userJobId,
        startIndex: 0,
        maxFiles: 0
      }
    });

    const { data: { d: { downloadUrl = '' } = {} } = {} } = getDownloadInfoResponse;

    console.log({ downloadUrl });

    const res = await axios({
      url: `${baseUrl}${downloadUrl}&batchsize=1200&startIndex=0`,
      method: 'GET',
      headers: {
        'content-type': 'application/zip',
        cookie: filteredCookies
      },
      responseType: 'arraybuffer'
    });

    // unzipping the folder
    const zipFolder = new AdmZip(res?.data);

    // const directoryPath = path.join(process.cwd(), `Pic-Time/${userEmail}/${galleryName}`);
    const directoryPath = path.join('D:', `Pic-Time/${userEmail}/${galleryName}`);

    console.log({ directoryPath });

    if (!fs.existsSync(directoryPath)) {
      fs.mkdirSync(directoryPath, { recursive: true });
    }

    zipFolder.extractAllTo(directoryPath, true);

    console.log('File downloaded and extracted from zip & saved successfully!');
  } catch (err) {
    console.log('Error in Download Photos Method', err);

    if (err?.response?.status === 429 && retries > 0) {
      console.warn(`Rate-limit Error, pausing request for ${BASE_DELAY_MS}s`);
      console.log('Error headers', err?.response);
      const delay = err?.response?.headers['retry-after'] || BASE_DELAY_MS;

      console.log({ delay });
      console.log('WAITING....')
  
      await sleep(delay);

      retries -= 1;

      return DownloadSetPhotos({
        collectionId,
        photoIds,
        galleryName,
        setName,
        baseUrl,
        filteredCookies,
        userEmail
      });
    } else if (retries === 0) {
      console.error(`Max retries reached for set ${setName}`);
    }
    throw err;
  }
};

const DownloadPhotos = async ({
  baseUrl,
  filteredCookies,
  userEmail
}) => {
  axios.defaults.timeout = 30000;
  axios.defaults.httpsAgent = new https.Agent({ keepAlive: true });

  let gallery;

  do {
    let errorInGallery = false;
    [gallery] = await GetGalleries({
      filterParams: {
        userEmail,
        platform,
        isArchived: { $exists: false },
        $or: [
          { isLocked: { $exists: false } },
          { isLocked: false }
        ],
        isDownloaded: { $exists: false },
        $or: [
          { retryCount: { $exists: false } },
          { retryCount: { $lt: 3 } }
        ]
      }, limit: 1
    });

    let photosData;
    try {
      console.log({ gallery });

      if (gallery) {
        await UpdateGallery({
          filterParams: { userEmail, collectionId: gallery.collectionId },
          updateParams: { isLocked: true }
        });

        const gallerySets = await GetGallerySets({
          filterParams: {
            userEmail,
            collectionId: gallery.collectionId,
            isDownloaded: { $exists: false }
          }
        });

        console.log({ gallerySets: gallerySets.length });

        for (let j = 0; j < gallerySets.length; j += 1) {
          let errorInGallerySet = false;
          const set = gallerySets[j];

          console.log('Gallery Set Id', set.setId);

          photosData = await GetGalleryPhotos({
            filterParams: {
              userEmail,
              collectionId: gallery.collectionId,
              setId: set.setId,
              isDownloaded: { $exists: false }
            }
          });

          const photoIds = photosData.map((photo) => photo.photoId);

          console.log({ photoIds: photoIds.length })

          if (photosData.length) {
            try {
              await DownloadSetPhotos({
                baseUrl,
                collectionId: gallery.collectionId,
                photoIds,
                galleryName: gallery.name,
                setName: set.name,
                filteredCookies,
                userEmail
              });
  
              await UpdateGalleryPhotos({
                filterParams: {
                  userEmail,
                  photoId: { $in: photoIds }
                },
                updateParams: { isDownloaded: true }
              });
            } catch (err) {
              console.log('Error while downloading Photos', err);

              await UpdateGallerySet({
                filterParams: {
                  userEmail,
                  setId: set.setId
                },
                updateParams: { problematic: true }
              });

              errorInGallery = true;
              errorInGallerySet = true
            }
          }

          if (!errorInGallerySet) {
            await UpdateGallerySet({
              filterParams: {
                userEmail,
                setId: set.setId
              },
              updateParams: { isDownloaded: true }
            });

            console.log('All photos downloaded for Set', set.setId);
          }
        }

        if (!errorInGallery) {
          await UpdateGallery({
            filterParams: {
              userEmail,
              collectionId: gallery.collectionId
            },
            updateParams: { isDownloaded: true }
          });
        } else {
          await UpdateGallery({
            filterParams: {
              userEmail,
              collectionId: gallery.collectionId
            },
            updateParams: {
              isLocked: false,
              retryCount: 1
             }
          });
        }

        console.log('Gallery updated!', gallery.collectionId);

        await sleep(10);
      }
    } catch (err) {
      console.log('Error in Download Photos Method!', err);
      throw err;
    }
  } while (gallery)
  return true;
};

export default DownloadPhotos;
