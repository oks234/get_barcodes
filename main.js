const { constants } = require('fs');
const { access, readFile, mkdir } = require('fs/promises');
const path = require("path");
const puppeteer = require("puppeteer");

const LIST_PAGE_LINK_SELECTOR = '.contents .a_bold';

async function getConfigs() {
  const CONFIGS_FILE_PATH = 'configs.txt';
  const result = {};

  await access(CONFIGS_FILE_PATH)
    .then(() => console.log(`can access ${CONFIGS_FILE_PATH}`))
    .catch((res) => console.error(`cannot access ${CONFIGS_FILE_PATH}:`, res));
  
  const fileBuffer = await readFile(CONFIGS_FILE_PATH)
    .catch((res) => console.error(`cannot read file ${CONFIGS_FILE_PATH}:`, res));
  
  const configs = fileBuffer.toString().split('\n').map(config => config.split(':'));

  configs.forEach(([key, value]) => {
    result[key] = value;
  });
  
  return result;
}

async function login(page, {USER_ID, USER_PW}) {
  const LOGIN_URL = "http://gs1.koreannet.or.kr/login/login.do";

  await page.goto(LOGIN_URL);
  await page.evaluate(
    (id, pw) => {
      const unserNameInput = document.querySelector("#userName");
      const passwordInput = document.querySelector("#passWord");
      unserNameInput.value = id;
      passwordInput.value = pw;
    },
    USER_ID,
    USER_PW
  );
  const loginBtn = await page.$(".btn_login");
  await loginBtn.click();
}

async function goToListPage(page, {SEARCH_START_DATE, SEARCH_END_DATE}) {
  const LIST_PAGE_URL = "http://gs1.koreannet.or.kr/product/info/standard/list.do";
  const SEARCH_FORM_BTN_SELECTOR = '.search_form .search_orange';

  await page.goto(LIST_PAGE_URL);
  await page.waitForSelector(SEARCH_FORM_BTN_SELECTOR);

  await page.evaluate(
    (searchStartDate, searchEndDate) => {
      const searchStartInput = document.querySelector('#searchStartDate');
      const searchEndInput = document.querySelector('#searchEndDate');
      searchStartInput.value = searchStartDate;
      searchEndInput.value = searchEndDate;
    },
    SEARCH_START_DATE,
    SEARCH_END_DATE,
  );
  
  await page.click(SEARCH_FORM_BTN_SELECTOR);
  await page.waitForSelector(LIST_PAGE_LINK_SELECTOR);
}

async function getBarcodes({USER_ID, USER_PW, SEARCH_START_DATE, SEARCH_END_DATE, DIST_PATH}) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page._client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: DIST_PATH,
  });
  await login(page, {USER_ID, USER_PW});
  await goToListPage(page, {SEARCH_START_DATE, SEARCH_END_DATE});
  let linkIdx = 0;
  let pageIdx = 0;
  let formDatas = [];
  async function getFormDataRecursively() {
    console.log(`get ${pageIdx + 1}page\'s ${linkIdx + 1} data.`);
    const links = await page.$$(LIST_PAGE_LINK_SELECTOR);
    if (linkIdx < links.length) {
      await links[linkIdx].click();
      await page.waitForSelector('#detailForm');
      const productDetailFormData = await page.$$eval('#detailForm > input', inputs => inputs.map(input => {
        const name = input.name;
        const value = input.value;
    
        return {
          name,
          value: value ? value : '',
        };
      }));
      formDatas.push(productDetailFormData);
      linkIdx += 1;
      await page.goBack();
      await page.waitForSelector(LIST_PAGE_LINK_SELECTOR);
      // await getFormDataRecursively();
    } else {
      await page.screenshot({ path: path.join(DIST_PATH, `list page ${pageIdx + 1}.png`) });
      const pagings = await page.$$('.paging li a');

      if (pageIdx < pagings.length - 1) {
        pageIdx += 1;
        linkIdx = 0;
        pagings[pageIdx].click();
        await page.waitForNavigation();
        // await getFormDataRecursively();
      }
    }
  }
  await getFormDataRecursively();
  console.log(`\ndata length: ${formDatas.length}\n`);
  let formDataIdx = 0;
  async function downloadBarcodeRecursively() {
    console.log(`download ${formDataIdx + 1} barcode.`);
    const formData = formDatas[formDataIdx];
    const DOWNLOAD_BARCODE_PAGE_BASE_URL = "http://gs1.koreannet.or.kr/product/info/pop/popBarCodeFind.do";
    let DOWNLOAD_BARCODE_PAGE_URL = `${DOWNLOAD_BARCODE_PAGE_BASE_URL}?${formData.reduce((prev, curr) => {
      return `${prev}${curr.name}=${curr.value}&`;
    }, '')}`;
    DOWNLOAD_BARCODE_PAGE_URL = DOWNLOAD_BARCODE_PAGE_URL.slice(0, DOWNLOAD_BARCODE_PAGE_URL.length - 1);
    console.log({DOWNLOAD_BARCODE_PAGE_URL});
    await page.goto(DOWNLOAD_BARCODE_PAGE_URL);
    // const parent = await page.waitForSelector('#selectImgList');
    await page.waitForNavigation({
      waitUntil: 'networkidle2',
    });
    const parent = await page.$('#selectImgList');
    console.log('parent:', !!parent);
    const downloadBtn = await parent.$('a');
    console.log('downloadBtn:', !!downloadBtn);
    await downloadBtn.click();
  }
  downloadBarcodeRecursively();
  
  try {
    await access(DIST_PATH, constants.R_OK | constants.W_OK);
  } catch {
    await mkdir(DIST_PATH);
  } finally {
    await page.screenshot({ path: path.join(DIST_PATH, "koreannet.png") });
  }
  
  await browser.close();
}

(async () => {
  const CONFIGS = await getConfigs();
  await getBarcodes(CONFIGS);
})();
