const GIFT_RULES = [
  {
    // Bed -> Mattress (match size by variant_title)
    triggerProductId: 15715064643965,
    giftProductHandle: 'saltea-supreme-de-la-isleep',
    matchByVariantTitle: true,
    fixedGiftVariantId: null,
  },
  {
    // Bed -> Mattress (match size by variant_title)
    triggerProductId: 15714998878589,
    giftProductHandle: 'saltea-silverplus-de-la-isleep',
    matchByVariantTitle: true,
    fixedGiftVariantId: null,
  },
  {
    // Bed -> Mattress (match size by variant_title)
    triggerProductId: 15714964603261,
    giftProductHandle: 'saltea-silverplus-de-la-isleep',
    matchByVariantTitle: true,
    fixedGiftVariantId: null,
  },
];

const GIFT_PROPERTY_KEY = '_gift_for_product_id';
const giftProductsCache = {};

const themeRoutes = window.theme?.routes || {};
const CART_BASE_URL = themeRoutes.cart_url || '/cart';
const CART_ADD_URL = themeRoutes.cart_add_url || '/cart/add.js';
const CART_CHANGE_URL = themeRoutes.cart_change_url || '/cart/change.js';
const CART_JSON_URL = CART_BASE_URL.endsWith('.js') ? CART_BASE_URL : `${CART_BASE_URL}.js`;

const isAnyGiftItem = (item) => {
  return Boolean(item?.properties && typeof item.properties[GIFT_PROPERTY_KEY] !== 'undefined');
};

const isGiftForTrigger = (item, triggerProductId) => {
  return item?.properties?.[GIFT_PROPERTY_KEY] === String(triggerProductId);
};

const fetchGiftProductByHandle = async (handle) => {
  if (giftProductsCache[handle]) return giftProductsCache[handle];

  try {
    const response = await fetch(`/products/${handle}.js`, {
      method: 'GET',
      headers: {Accept: 'application/json'},
    });

    if (!response.ok) {
      console.error('[GIFT] Gift product fetch failed:', handle, response.status, response.statusText);
      return null;
    }

    const data = await response.json();
    giftProductsCache[handle] = data;
    return data;
  } catch (error) {
    console.error('[GIFT] Error fetching gift product JSON for', handle, error);
    return null;
  }
};

const findMatchingGiftVariantForHandle = async (giftHandle, triggerVariantTitle) => {
  const giftProduct = await fetchGiftProductByHandle(giftHandle);
  if (!giftProduct || !Array.isArray(giftProduct.variants)) return null;

  const matchingVariant = giftProduct.variants.find(
    (variant) => variant.title === triggerVariantTitle || variant.option1 === triggerVariantTitle,
  );

  return matchingVariant ? matchingVariant.id : null;
};

const getCart = async () => {
  const response = await fetch(CART_JSON_URL, {
    method: 'GET',
    headers: {Accept: 'application/json'},
  });

  if (!response.ok) {
    throw new Error(`[GIFT] Failed to fetch cart: ${response.status} ${response.statusText}`);
  }

  return response.json();
};

const addCartItem = async ({id, quantity, properties}) => {
  return fetch(CART_ADD_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({id, quantity, properties}),
  });
};

const changeCartLine = async ({key, quantity}) => {
  return fetch(CART_CHANGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({id: key, quantity}),
  });
};

const buildGiftOperations = async (cart) => {
  const items = cart?.items || [];
  const operations = [];

  for (const rule of GIFT_RULES) {
    const {triggerProductId, giftProductHandle, matchByVariantTitle, fixedGiftVariantId} = rule;

    const triggerItems = items.filter((item) => item.product_id === triggerProductId && !isAnyGiftItem(item));
    const existingGiftItems = items.filter((item) => isGiftForTrigger(item, triggerProductId));

    if (!triggerItems.length) {
      existingGiftItems.forEach((giftItem) => {
        operations.push({type: 'change', key: giftItem.key, quantity: 0});
      });
      continue;
    }

    const requiredByGiftVariantId = new Map();

    for (const triggerItem of triggerItems) {
      const triggerQty = triggerItem.quantity || 0;
      if (triggerQty <= 0) continue;

      let giftVariantId = null;

      if (matchByVariantTitle) {
        giftVariantId = await findMatchingGiftVariantForHandle(giftProductHandle, triggerItem.variant_title);
      } else {
        giftVariantId = fixedGiftVariantId;
      }

      if (!giftVariantId) continue;

      const nextQty = (requiredByGiftVariantId.get(giftVariantId) || 0) + triggerQty;
      requiredByGiftVariantId.set(giftVariantId, nextQty);
    }

    const existingByGiftVariantId = new Map();
    existingGiftItems.forEach((giftItem) => {
      const list = existingByGiftVariantId.get(giftItem.variant_id) || [];
      list.push(giftItem);
      existingByGiftVariantId.set(giftItem.variant_id, list);
    });

    requiredByGiftVariantId.forEach((requiredQty, giftVariantId) => {
      const existingLines = existingByGiftVariantId.get(giftVariantId) || [];

      if (!existingLines.length) {
        operations.push({
          type: 'add',
          id: giftVariantId,
          quantity: requiredQty,
          properties: {
            [GIFT_PROPERTY_KEY]: String(triggerProductId),
          },
        });
        return;
      }

      const [primaryLine, ...extraLines] = existingLines;
      const existingTotalQty = existingLines.reduce((sum, line) => sum + (line.quantity || 0), 0);

      if (existingTotalQty !== requiredQty) {
        operations.push({type: 'change', key: primaryLine.key, quantity: requiredQty});
      }

      extraLines.forEach((line) => {
        operations.push({type: 'change', key: line.key, quantity: 0});
      });

      existingByGiftVariantId.delete(giftVariantId);
    });

    existingByGiftVariantId.forEach((lines) => {
      lines.forEach((line) => {
        operations.push({type: 'change', key: line.key, quantity: 0});
      });
    });
  }

  return operations;
};

const applyOperations = async (operations) => {
  if (!operations.length) return false;

  for (const operation of operations) {
    let response;

    if (operation.type === 'add') {
      response = await addCartItem(operation);
    } else {
      response = await changeCartLine(operation);
    }

    if (!response.ok) {
      console.error('[GIFT] Cart operation failed:', operation, response.status, response.statusText);
    }
  }

  return true;
};

let isSyncInProgress = false;
let hasQueuedSync = false;

const runGiftSync = async () => {
  if (isSyncInProgress) {
    hasQueuedSync = true;
    return;
  }

  isSyncInProgress = true;

  try {
    const cart = await getCart();
    const operations = await buildGiftOperations(cart);
    const changed = await applyOperations(operations);

    if (changed) {
      document.dispatchEvent(new CustomEvent('theme:cart:refresh', {bubbles: true}));
    }
  } catch (error) {
    console.error('[GIFT] Failed to sync gift rules', error);
  } finally {
    isSyncInProgress = false;

    if (hasQueuedSync) {
      hasQueuedSync = false;
      runGiftSync();
    }
  }
};

const initGiftWithProduct = () => {
  runGiftSync();
  document.addEventListener('theme:cart:change', runGiftSync);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGiftWithProduct);
} else {
  initGiftWithProduct();
}
