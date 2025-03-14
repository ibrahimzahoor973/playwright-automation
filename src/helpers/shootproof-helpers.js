import pkg from 'lodash';
import axios from '../../config/axios.js';
import fs from 'fs';
import path from 'path';
import { SaveGalleries, UpdateGallery, GetGalleries as GetGalleriesFromDb, UpdateGalleries } from '../../db-services/gallery.js';
import { SaveClients } from '../../db-services/client.js';
import { GetGallerySets, SaveGallerySets, UpdateGallerySet, UpdateGallerySets } from '../../db-services/gallery-set.js';
import { SaveGalleryPhotos } from '../../db-services/photo.js';
import { generateGUID, navigateWithRetry, sleep } from './common.js';
import { GetAccount, UpdateAccount } from '../../db-services/account.js';

const { groupBy } = pkg;

const { platform } = process.env;

const GetAndSaveBrand = async ({
  authorizationToken,
  userEmail,
  platform
}) => {
  const response = await axios({
    url: 'https://api.shootproof.com/studio/brand',
    method: 'GET',
    headers: {
      'content-type': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'authorization': authorizationToken
    }
  });

  let brandId;

  const { data: { items = [] } = {} } = response;
  if (items.length) {
    const brand = items.find((item) => item.email === userEmail);

    brandId = brand?.id;
    await UpdateAccount({
      filterParams: {
        email: userEmail,
        platform,
        uploadScriptAccount: { $exists: false }
      },
      updateParams: {
        shootProofBrandId: brandId
      }
    });
    return brandId;
  }
}

const parseGalleries = ({
  collections
}) => {
  const guid = generateGUID();
  return collections.map((collection) => {
    let coverPhoto;
    if (collection.coverPhoto) {
      const { coverPhoto: { displayUrl : { large } = {} } } = collection;
      coverPhoto = large;
    }
    return {
    collectionId: collection.id,
    galleryName: collection.name,
    numberOfPhotos: collection.photosCount,
    eventDate: collection.eventDate,
    categories: collection.eventCategory,
    coverPhoto,
    externalProjRef: guid
  }
  });
}

const GetGalleries = async ({
  authorizationToken,
  brandId,
  page
}) => {
  const response = await axios({
    url: `https://api.shootproof.com/studio/brand/${brandId}/event`,
    method: 'GET',
    headers: {
      'content-type': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Authorization: authorizationToken
    },
    params: {
      rows: 100,
      page
    }
  });

  const {
    meta: {
      totalPages
    } = {},
    items = []
  } = response?.data || {};

  return {
    totalPages,
    items
  }
}

const GetAndSaveGalleries = async ({ authorizationToken, userEmail, brandId }) => {
  let collections = [];

  let page = 1;

  const { totalPages, items = [] } = await GetGalleries({
    authorizationToken,
    brandId,
    page
  });

  console.log({
    totalPages,
    items: items.length
  });

  if (items.length) {
    const galleries = parseGalleries({ collections: items });

    collections.push(...galleries);
  
    await SaveGalleries({
      galleries,
      userEmail,
      platform,
      pageNumber: page
    });
  
    while (page < totalPages) {
      page += 1;
  
      const { totalPages, items } = await GetGalleries({
        authorizationToken,
        brandId,
        page
      });
  
      totalPages = meta?.totalPages;
      items = data?.items;
  
      const galleries = parseGalleries({ collections: items });
  
      await SaveGalleries({
        galleries,
        userEmail,
        platform,
        pageNumber: page
      });
  
      collections.push(...galleries);
      console.log({
        collections: collections.length
      });
    }
  
    console.log({
      collectionsAtTheEnd: collections.length,
      collectionId: collections[collections.length - 1]?.collectionId
    });
  
    await UpdateGallery({
      filterParams: {
        userEmail,
        platform,
        collectionId: collections[collections.length - 1]?.collectionId
      },
      updateParams: {
        allGalleriesSynced: true
      }
    });
  }
};

const GetAndSaveClients = async ({
  page,
  userEmail,
  platform,
  brandId,
  collectionId
}) => {
  await page.goto(`https://studio.shootproof.com/v2/${brandId}/report/galleryvisitor?event_id=${collectionId}`);

  await sleep(10);
  const clientsData = [];
  const tableBody = await page.$('.table-body');
  console.log({ tableBody });

  const tableRows = await tableBody?.$$('.tr');
  console.log({ tableRows: tableRows?.length });

  for (let i = 0; i < tableRows?.length; i += 1) {
    const row = tableRows[i];
    const tableCells = await row.$$eval('div', (divs) => {
      return divs.map((div) => {
        if (div.className === 'td check') {
          const checkBoxDiv = div.querySelector('input[type="checkbox"]');
          const checkBoxValue = checkBoxDiv.value;
          return checkBoxValue;
        } else {
          return div.innerText.trim();
        }
      });
    });

    if (tableCells.length) {
      const checkBoxValue = tableCells[0];
      const galleryName = tableCells[2];

      const values = checkBoxValue.split('-');

      clientsData.push({
        galleryName,
        collectionId: values[0],
        clientEmail: values[1]
      });
    } else {
      console.log('Selector Not Found!');
    }

    await SaveClients({
      clients: clientsData,
      userEmail,
      platform
    });
  }

  await UpdateGallery({
    filterParams: {
      collectionId
    },
    updateParams: {
      clientsSynced: true
    }
  });
};

const GetAlbums = async ({
  authorizationToken,
  brandId,
  collectionId,
  page
}) => {
  const response = await axios({
    url: `https://api.shootproof.com/studio/brand/${brandId}/event/${collectionId}/album`,
    method: 'GET',
    headers: {
      'content-type': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'authorization': authorizationToken
    },
    params: {
      page
    }
  });

  const { data = {} } = response || {};
  const { meta: { totalPages = 0 } = {}, items = [] } = data;

  return {
    totalPages,
    items
  };
};

const aggregatePhotos = (album) => {
  let totalPhotos = album.photosCount;
  let childIds = [];
  
  for (const child of album.children) {
    const { totalPhotos: childPhotos, childIds: nestedChildIds } = aggregatePhotos(child);
    totalPhotos += childPhotos;
    childIds.push((child.id).toString(), ...nestedChildIds);
  }
  
  album.totalPhotos = totalPhotos;
  album.childIds = childIds;
  
  return { totalPhotos, childIds };
}

const parseGallerySets = (data, collectionId) => {
  const albumMap = new Map();
  data.forEach(album => {
  album.children = [];
  albumMap.set(album.id, album);
  });

  // Build the hierarchical structure
  const rootAlbums = [];
  data.forEach(album => {
  if (album.parentAlbumId === null) {
    rootAlbums.push(album);
  } else {
    const parentAlbum = albumMap.get(album.parentAlbumId);
    if (parentAlbum) {
        parentAlbum.children.push(album);
    }
  }
  });

  // Recursive function to aggregate photos and collect child IDs


  // Process all root albums
  rootAlbums.forEach(album => aggregatePhotos(album));

  // Extract only the required data
  const simplifiedAlbums = rootAlbums.map(album => ({
  collectionId,
  setId: album.id,
  name: album.name,
  photoCount: album.totalPhotos,
  subAlbumIds: album.childIds
  }));

  return simplifiedAlbums;
}

const GetAndSaveGalleryAlbums = async ({
  authorizationToken,
  brandId,
  collectionId,
  galleryName,
  userEmail,
  platform
}) => {
  let page = 1;
  const { totalPages, items } = await GetAlbums({
    authorizationToken,
    brandId,
    collectionId,
    page
  });
  const gallerySets = parseGallerySets(items, collectionId);


  await SaveGallerySets({
    gallerySets,
    galleryName,
    userEmail,
    platform
  });

  while (page < totalPages) {
    page += 1;
    const { totalPages, items } = await GetAlbums({
      authorizationToken,
      brandId,
      collectionId,
      page
    });

  const gallerySets = parseGallerySets(items, collectionId);


  await SaveGallerySets({
    gallerySets,
    galleryName,
    userEmail,
    platform
  });
  
}
};

const GetAndSaveGalleryPhotos = async ({
  authorizationToken,
  brandId,
  collectionId,
  galleryName,
  gallerySets,
  userEmail,
  platform
}) => {
  const response = await axios({
    url: `https://api.shootproof.com/studio/brand/${brandId}/event/${collectionId}/photo`,
    method: 'GET',
    headers: {
      'content-type': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Authorization: authorizationToken
    }
  });

  const { data: { items = [] } = {} } = response || {};
  console.log({
    galleryName,
    collectionId,
    photos: items.length
  })
  const photos = items.map((item) => {
    const [setId] = item.belongsToAlbumIds;
    console.log({
      setId
    });

    const set = gallerySets.find((set) => set.subsetIds.includes(setId?.toString()) || set.setId === setId?.toString());

    return {
      collectionId,
      galleryName,
      photoId: item.id,
      name: item.name,
      setName: set?.name || 'Photos',
      setId: set?.setId
    }
  });

  await SaveGalleryPhotos({
    photos,
    userEmail,
    platform
  });
}

const GetAlbumsAndPhotos = async ({
  page,
  userEmail,
  platform,
  baseUrl,
  authorizationToken
}) => {
  try {
    await navigateWithRetry(page, baseUrl);
    let brandId;
    const account = await GetAccount({
      filterParams: {
        email: userEmail,
        platform,
        uploadScriptAccount: { $exists: false }
      }
    });

    console.log({
      account
    });

    const { shootProofBrandId } = account || {};
    brandId = shootProofBrandId;
    if (!brandId) {
      const brandIdentifier = await GetAndSaveBrand({
        authorizationToken,
        userEmail,
        platform
      });
      console.log({
        brandIdentifier
      })
      brandId = brandIdentifier;
    }

    if (brandId) {
      let gallerySets = [];
      let collections = [];
      const photosData = [];

      const [gallery] = await GetGalleriesFromDb({
        filterParams: {
          userEmail,
          platform,
          allGalleriesSynced: true
        }, limit: 1
      });

      console.log({
        gallery,
        brandId
      });

      if (!gallery) {
        await GetAndSaveGalleries({ authorizationToken, userEmail, brandId });
      }

      collections = await GetGalleriesFromDb({
        filterParams: {
          userEmail,
          platform,
          clientsSynced: { $exists: false }
        }
      });

      console.log({
        collectionsFromDb: collections.length
      });

      for (let i = 0; i < collections.length; i += 1) {
        const collection = collections[i];
        await GetAndSaveClients({
          page,
          userEmail,
          platform,
          brandId,
          collectionId: collection.collectionId
        });
        console.log(`Clients For Collection Id ${collection.collectionId} are saved`);
      }

      collections = await GetGalleriesFromDb({
        filterParams: {
          userEmail,
          platform,
          gallerySetsSynced: { $exists: false }
        }
      });

      for (let i = 0; i < collections.length; i += 1) {
        const collection = collections[i];
        console.log({
          collection: collection.collectionId
        });
      
        await GetAndSaveGalleryAlbums({
          authorizationToken,
          brandId,
          collectionId: collection.collectionId,
          galleryName: collection.name,
          userEmail,
          platform
        });

        await UpdateGallery({
          filterParams: {
            collectionId: collection.collectionId
          },
          updateParams: {
            gallerySetsSynced: true
          }
        });
      }
  
      collections = await GetGalleriesFromDb({
        filterParams: {
          userEmail,
          platform,
          photosSynced: { $exists: false }
        }
      });
      
      const gallerySetsData = await GetGallerySets({
        filterParams: {
          userEmail,
          platform
        }
    });

      for (let i = 0; i < collections.length; i += 1) {
        const collection = collections[i]
        const gallerySets = gallerySetsData.filter((set) => set.collectionId === collection.collectionId);
        const setIds = gallerySets?.map((set) => set.id) || [];

        console.log({
          gallerySets,
          setIds
        });

        await GetAndSaveGalleryPhotos({
          authorizationToken,
          brandId,
          collectionId: collection.collectionId,
          galleryName: collection.name,
          gallerySets,
          userEmail,
          platform
        });

        await UpdateGallery({
          filterParams: {
            collectionId: collection.collectionId
          },
          updateParams: {
            photosSynced: true
          }
        });

        await UpdateGallerySets({
          filterParams: {
            collectionId: collection.collectionId,
            setId: { $in: setIds }
          },
          updateParams: {
            photosSynced: true
          }
        });
      }

    }
    return true;
  } catch (err) {
    console.log('Error in GetGalleryPhotos method', err);
    throw err;
  }
};

export default GetAlbumsAndPhotos;
