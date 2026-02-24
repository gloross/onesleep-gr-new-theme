const selectors = {
  popupClose: '.js-popup-close',
  spinner: '.js-spinner',
  initCalculatorsBtn: '.js-init-calculators',
  calculatorsPopup: '.js-calculators-popup',
  calculatorOverlay: '.js-calculator-overlay',
  calculatorTabs: '[data-calculator-tabs]',
  calculatorBody: '[data-calculator-body]',
  calculatorSchemes: '[data-calculator-schemes]',
};

const calculatorsPopup = document.querySelector(selectors.calculatorsPopup);
const calculatorOverlay = document.querySelector(selectors.calculatorOverlay);
const spinner = document.querySelector(selectors.spinner);

const calculatorTabs = document.querySelector(selectors.calculatorTabs);
const calculatorSchemes = document.querySelector(selectors.calculatorSchemes);

let price = null;

const tbiMaturity = [];

//TBI SCHEME
const initTbiScheme = () => {
  return new Promise((resolve, reject) => {
    toggleSpinner(true);

    fetch(
      `https://apps.gloross.com/TBIShopifyWebhook/GetCalcForAllScheme?privateAppId=32&amount=${price}&categoryId=123`,
      {
        method: 'POST',
        mode: 'cors',
        headers: {
          accept: 'application/json',
        },
      },
    )
      .then((response) => response.json())
      .then((data) => {
        const messages = Object.entries(JSON.parse(data.message));

        messages.forEach((message, index) => {
          const values = message.pop();
          tbiMaturity.push(values.NumberInstallments);

          calculatorSchemes.innerHTML += `
            <div class="calculator-popup__scheme ${index === 0 ? 'is-selected' : ''}" data-maturity-scheme="${
              values.NumberInstallments
            }">
              <span class="calculator-popup__scheme__item calculator-popup__scheme__item--price">
                <span class="mobile">
                  Месечна вноска:
                </span>

                ${values.MonthlyPayment}€
              </span>

              <span class="calculator-popup__scheme__item">
                <span class="mobile">
                  Обща сума за плащане:
                </span>

                <span class="eur-conv">${values.TotalAmountDue}€</span>
              </span>

              <span class="calculator-popup__scheme__item">
                <span class="mobile">
                  ГПР:
                </span>

                ${values.Gpr}%
              </span>

              <span class="calculator-popup__scheme__item">
                <span class="mobile">
                  Лихва:
                </span>

                ${values.Glp}%
              </span>

              <span class="calculator-popup__scheme__item calculator-popup__scheme__item--logo">
                <img src="${tbiLogo}">
              </span>
            </div>
          `;
        });

        resolve(); // Resolve the promise here after the data processing is done
      })
      .catch((error) => {
        toggleSpinner(false);
        handlePopupClose();
        console.error('Error:', error);
        reject(error); // Reject the promise if there's an error
      });
  });
};

document.querySelector(selectors.initCalculatorsBtn)?.addEventListener('click', (e) => {
  e.target.setAttribute('disabled', true);
  price = e.target.dataset.price;
  price = price.slice(0, -2) + '.' + price.slice(-2);

  // Use Promise.all to wait for both Promises to resolve
  Promise.all([initTbiScheme()]).then(() => {
    // Promise.all([initTbiScheme()]).then(() => {
    let mergedArray = [...new Set([...tbiMaturity])];

    calculatorTabs.innerHTML = `
      ${mergedArray
        .sort((a, b) => a - b)
        .map((maturity, index) => {
          return `<button type="button" class="calculator-popup__tab ${
            index === 0 ? 'is-active' : ''
          }" data-maturity="${maturity}">${maturity} месеца</button>`;
        })
        .join('')}
    `;

    //hide spinner
    toggleSpinner(false);
    //show popup
    calculatorsPopup.classList.add('is-visible');
    calculatorsPopup.previousElementSibling.classList.add('is-visible');

    //add event listener to tabs
    const calculatorTabsBtns = document.querySelectorAll(`${selectors.calculatorTabs} button`);
    calculatorTabsBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const maturity = e.target.dataset.maturity;

        calculatorTabsBtns.forEach((btn) => {
          btn.classList.remove('is-active');
        });

        e.target.classList.add('is-active');
        const schemes = document.querySelectorAll(`${selectors.calculatorSchemes} div`);
        schemes.forEach((scheme) => {
          if (scheme.dataset.maturityScheme === maturity) {
            scheme.classList.add('is-selected');
          } else {
            scheme.classList.remove('is-selected');
          }
        });
      });
    });

    document.querySelector(selectors.initCalculatorsBtn).removeAttribute('disabled');
  });
});

//TOGGLE SPINNER
const toggleSpinner = (isVisible) => {
  spinner.classList[isVisible ? 'add' : 'remove']('is-visible');
};

//CLOSE POPUP
const handlePopupClose = (e) => {
  e.preventDefault();

  calculatorsPopup.classList.remove('is-visible');
  calculatorsPopup.previousElementSibling.classList.remove('is-visible');

  //empty schemes
  tbiMaturity.length = 0;
  calculatorSchemes.innerHTML = '';
  document.querySelector(selectors.initCalculatorsBtn).removeAttribute('disabled');
};

document.querySelector(selectors.popupClose).addEventListener('click', handlePopupClose);
document.querySelector(selectors.calculatorOverlay).addEventListener('click', handlePopupClose);
