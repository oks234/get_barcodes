const { constants } = require("fs");
const { access, readFile, mkdir, writeFile } = require("fs/promises");
const path = require("path");
const puppeteer = require("puppeteer");

const LIST_PAGE_LINK_SELECTOR = ".contents .a_bold";

const findFormDataItemGtin = (formData) => formData.find(item => item.name === 'gtin');

async function getConfigs() {
  const CONFIGS_FILE_PATH = "configs.txt";
  const result = {};

  await access(CONFIGS_FILE_PATH)
    .then(() => console.log(`can access ${CONFIGS_FILE_PATH}`))
    .catch((res) => console.error(`cannot access ${CONFIGS_FILE_PATH}:`, res));

  const fileBuffer = await readFile(CONFIGS_FILE_PATH).catch((res) => console.error(`cannot read file ${CONFIGS_FILE_PATH}:`, res));

  const configs = fileBuffer
    .toString()
    .split("\n")
    .map((config) => config.split(":"));

  configs.forEach(([key, value]) => {
    result[key] = value;
  });

  console.log("getConfigs", configs);

  return result;
}

async function login(page, { USER_ID, USER_PW }) {
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

async function goToListPage(page, { SEARCH_START_DATE, SEARCH_END_DATE }) {
  const LIST_PAGE_URL = "http://gs1.koreannet.or.kr/product/info/standard/list.do";
  const SEARCH_FORM_BTN_SELECTOR = ".search_form .search_orange";

  await page.goto(LIST_PAGE_URL);
  await page.waitForSelector(SEARCH_FORM_BTN_SELECTOR);

  await page.evaluate(
    (searchStartDate, searchEndDate) => {
      const searchStartInput = document.querySelector("#searchStartDate");
      const searchEndInput = document.querySelector("#searchEndDate");
      searchStartInput.value = searchStartDate;
      searchEndInput.value = searchEndDate;
    },
    SEARCH_START_DATE,
    SEARCH_END_DATE
  );

  await page.click(SEARCH_FORM_BTN_SELECTOR);
  await page.waitForSelector(LIST_PAGE_LINK_SELECTOR);
}
async function getBarcodes({ USER_ID, USER_PW, SEARCH_START_DATE, SEARCH_END_DATE, DIST_PATH }) {
  const DOWNLOAD_PATH = path.join(__dirname, DIST_PATH);
  const browser = await puppeteer.launch({
    // headless: false,
  });
  const page = await browser.newPage();
  await setDownloadPath();
  await login(page, { USER_ID, USER_PW });
  await goToListPage(page, { SEARCH_START_DATE, SEARCH_END_DATE });
  await screenshot("list page");
  let linkIdx = 0;
  let pageIdx = 0;
  let formDatas = [];
  let formDataIdx = 0;
  let missedFormDatas = [];
  let downloadMissedTryCnt = 0;
  await getFormDataRecursively();
  await saveListFile(formDatas, 'download_list.csv');
  await downloadProcessRecursively();
  // await downloadBarcodeRecursively();
  // formDataIdx = 0;
  // missedFormDatas = [];
  // await filterMissedBarcodeRecursively();
  await browser.close();

  async function setDownloadPath() {
    const client = await page.target().createCDPSession();
    await client.send("Page.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: DOWNLOAD_PATH,
    });

    console.log("set download path to", DOWNLOAD_PATH);
  }

  async function getFormDataRecursively() {
    const links = await page.$$(LIST_PAGE_LINK_SELECTOR);
    if (linkIdx < links.length) {
      console.log(`get ${pageIdx + 1} page\'s ${linkIdx + 1} data.`);
      await links[linkIdx].click();
      await page.waitForSelector("#detailForm");
      await screenshot(`detail page ${pageIdx + 1}_${linkIdx + 1}`);
      const productDetailFormData = await page.$$eval("#detailForm > input", (inputs) =>
        inputs.map((input) => {
          const name = input.name;
          const value = input.value;

          return {
            name,
            value: value ? value : "",
          };
        })
      );
      formDatas.push(productDetailFormData);
      linkIdx += 1;
      await page.goBack();
      await page.waitForSelector(LIST_PAGE_LINK_SELECTOR);
      await getFormDataRecursively();
    } else {
      const pagings = await page.$$(".paging li a");

      if (pageIdx < pagings.length - 1) {
        pageIdx += 1;
        linkIdx = 0;
        pagings[pageIdx].click();
        await page.waitForNavigation();
        await getFormDataRecursively();
      }
    }
  }

  async function saveListFile(datas, filename) {
    let data = '#,GTIN';
    datas.forEach((formData, idx) => {
      data += `\n${idx + 1},${findFormDataItemGtin(formData).value}`;
    });

    await writeFile(path.join(DIST_PATH, 'list.csv'), data);
  }
  
  async function downloadProcessRecursively() {
    formDataIdx = 0;
    await downloadBarcodeRecursively();
    formDataIdx = 0;
    missedFormDatas = [];
    await filterMissedBarcodeRecursively();
    console.log(formDatas.length);

    if (formDatas.length) {
      downloadMissedTryCnt += 1;
      if (downloadMissedTryCnt < 10) {
        await downloadProcessRecursively();
      } else {
        await saveListFile(formDatas, 'not_downloaded_list.csv');
      }
    }
  }

  async function downloadBarcodeRecursively() {
    const DOWNLOAD_BTN_SELECTOR = "#selectImgList a";
    console.log(`download ${formDataIdx + 1} barcode.`);
    const formData = formDatas[formDataIdx];
    const DOWNLOAD_BARCODE_PAGE_BASE_URL = "http://gs1.koreannet.or.kr/product/info/pop/popBarCodeFind.do";
    let DOWNLOAD_BARCODE_PAGE_URL = `${DOWNLOAD_BARCODE_PAGE_BASE_URL}?${formData.reduce((prev, curr) => {
      return `${prev}${curr.name}=${curr.value}&`;
    }, "")}`;
    DOWNLOAD_BARCODE_PAGE_URL = DOWNLOAD_BARCODE_PAGE_URL.slice(0, DOWNLOAD_BARCODE_PAGE_URL.length - 1);
    await page.goto(DOWNLOAD_BARCODE_PAGE_URL);
    const downloadBtn = await page.waitForSelector(DOWNLOAD_BTN_SELECTOR);
    await page.waitForTimeout(500);
    await downloadBtn.click();
    await screenshot(`download ${formDataIdx + 1} barcode page`);
    await page.waitForTimeout(1500);
    formDataIdx += 1;
    if (formDataIdx < formDatas.length) {
      await downloadBarcodeRecursively();
    }
  }

  async function filterMissedBarcodeRecursively() {
    const formData = formDatas[formDataIdx];
    const gtin = findFormDataItemGtin(formData).value;
    const filename = `${gtin}.eps`;
    const filepath = path.join(__dirname, DIST_PATH, filename);
    await access(filepath)
      .catch(() => {
        missedFormDatas.push(formDataIdx);
        console.log(`${filename} is not downloaded.`);
      });
    
    formDataIdx += 1;
    if (formDataIdx < formDatas.length - 1) {
      await filterMissedBarcodeRecursively();
    } else {
      console.log({missedFormDatas});
      formDatas = formDatas.filter((formData, idx) => missedFormDatas.includes(idx));
    }
  }

  async function screenshot(filename) {
    return;
    const filePath = path.join(DIST_PATH, `${filename}.png`);
    try {
      await access(DIST_PATH, constants.R_OK | constants.W_OK);
    } catch {
      await mkdir(DIST_PATH);
    } finally {
      await page.screenshot({ path: filePath, });
      console.log('screenshot', filePath);
    }
  }
}

(async () => {
  const CONFIGS = await getConfigs();
  await getBarcodes(CONFIGS);
})();
