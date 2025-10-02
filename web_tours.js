import http from 'k6/http';
import { check, group } from 'k6';
import { SharedArray } from 'k6/data';
import { randomItem } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const BASE_URL = 'http://webtours.load-test.ru:1080/cgi-bin';
//http://webtours.load-test.ru:1090

const data = new SharedArray('Get User Credentials', function () {
    const file = JSON.parse(open('./users.json'));
    return file.users;
});
const creditCard = '1111222233334444';

let cookie = ""
let sessionValue = "";
let departureCity = "";
let arrivalCity = "";
let payloadDirectionData = {}
let payloadFlightData = {}
let payloadPaymentData = {}

export const options = {
    scenarios: {
        webtours: {
            executor: 'constant-vus',
            vus: 1,
            duration: '10s',  

        },
    },
};

function openWelcomePage() {
    const welcomeResult = http.get(`${BASE_URL}/welcome.pl?signOff=true`);
    check(
        welcomeResult,
        {
            'Open Welcome Page | status_code is 200': (res) => res.status === 200,
        }
    );
    cookie = welcomeResult.headers["Set-Cookie"]

    const headers = {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': cookie
        }
    };
    const getSessionResult = http.get(`${BASE_URL}/nav.pl?in=home`, headers);
    check(
        getSessionResult,
        {
            'Get session | status_code is 200': (res) => res.status === 200,
        }
    );
    sessionValue = getSessionResult.html().find('input[name=userSession]').first().attr('value');
}

function login() {
    const credentials = data[0]
    const payload = {
        userSession: sessionValue,
        username: credentials.username,
        password: credentials.password,
    };
    const loginPostResult = http.post(`${BASE_URL}/login.pl`, payload, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': cookie
        }
    });
    check(
        loginPostResult,
        {
            'Login with credentials | status_code is 200': (res) => res.status === 200,
        }
    );
    cookie = loginPostResult.headers["Set-Cookie"]

    const headers = {
        headers: {
            'Cookie': cookie
        }
    };
    const homeNavigationPageResult = http.get(`${BASE_URL}/nav.pl?page=menu&in=home`, headers);
    check(
        homeNavigationPageResult,
        {
            'Open Home Navigation Page | status_code is 200': (res) => res.status === 200,
        }
    );

    const loginGetResult = http.get(`${BASE_URL}/login.pl?intro=true`, headers);
    check(
        loginGetResult,
        {
            'Get Login Request | status_code is 200': (res) => res.status === 200,
        }
    );
}

function chooseDirection() {
    const headers = {
        headers: {
            'Cookie': cookie
        }
    };
    const searchPageResult = http.get(`${BASE_URL}/welcome.pl?page=search`, headers);
    check(
        searchPageResult,
        { 'Open Find Flight Page | status_code is 200': (res) => res.status === 200 }
    );

    const flightNavigationPageResult = http.get(`${BASE_URL}/nav.pl?page=menu&in=flights`, headers);
    check(
        flightNavigationPageResult,
        { 'Open Flight Navigation Page | status_code is 200': (res) => res.status === 200 }
    );

    const welcomeReservationsPageResult = http.get(`${BASE_URL}/reservations.pl?page=welcome`, headers);
    check(
        welcomeReservationsPageResult,
        { 'Get reservation data | status_code is 200': (res) => res.status === 200 }
    );

    // Получаем список городов отправления и выбираем город отправления
    const doc = welcomeReservationsPageResult.html();
    let departureCities = []
    doc.find('table select[name=depart] option')
        .toArray()
        .forEach(function (item) {
            departureCities.push(item.val());
        });
    departureCity = randomItem(departureCities);

    // Получаем список городов прибытия и выбираем город прибытия, отличный от города отправления
    let arrivalCities = []
    doc.find('table select[name=arrive] option')
        .toArray()
        .forEach(function (item) {
            arrivalCities.push(item.val());
        });
    arrivalCity = randomItem(arrivalCities.filter((item) => item !== departureCity));

    // Заполняем данные о полете для POST-запроса
   // payloadDirectionData["advanceDiscount"] = doc.find('input[name=advanceDiscount]').val();
    payloadDirectionData["advanceDiscount"] = "0";

    payloadDirectionData["depart"] = departureCity;
    //payloadDirectionData["departDate"] = doc.find('input[name=departDate]').val();
    payloadDirectionData["departDate"] = "10/01/2025";

    payloadDirectionData["arrive"] = arrivalCity;
    //payloadDirectionData["returnDate"] = doc.find('input[name=returnDate]').val();
    payloadDirectionData["returnDate"] = "10/02/2025";

    payloadDirectionData["numPassengers"] = "1";
   // payloadDirectionData["numPassengers"] = doc.find('input[name=numPassengers]').val();

    // payloadDirectionData["seatPref"] = doc.find('input[name=seatPref][checked=checked]').val();
    // payloadDirectionData["seatType"] = doc.find('input[name=seatType][checked=checked]').val();
    payloadDirectionData["seatPref"] = "None";
    payloadDirectionData["seatType"] = "Coach";
    payloadDirectionData["findFlights.x"] = 46;
    payloadDirectionData["findFlights.y"] = 2;
}

function findFlight() {
    const headers = {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': cookie
        }
    };
    const flightReservationsResult = http.post(`${BASE_URL}/reservations.pl`, payloadDirectionData, headers);
    check(
        flightReservationsResult,
        {
            'Find flight reservation data | status_code is 200': (res) => res.status === 200,
        }
    );

    // Получаем список рейсов по данному направлению (flight_number;cost;date)
    // let flights = []
    // flightReservationsResult.html().find('input[name=outboundFlight]')
    //     .toArray()
    //     .forEach(function (item) {
    //         flights.push(item.val());
    //     });

    let flights = [];
    const flightElements = flightReservationsResult.html().find('input[name=outboundFlight]')
        .toArray();
// Если есть элементы, выбираем случайный
    const randomFlight = flightElements.length > 0 
        ? flightElements[Math.floor(Math.random() * flightElements.length)].value 
        : null;
// Присваиваем переменной
    const selectedFlight = randomFlight;

    // Заполняем данные о рейсе для POST-запроса
    payloadFlightData["outboundFlight"] = randomFlight;
    // payloadFlightData["numPassengers"] = payloadDirectionData["numPassengers"];
    payloadFlightData["numPassengers"] = "1";
    // payloadFlightData["advanceDiscount"] = payloadDirectionData["advanceDiscount"];
    payloadFlightData["advanceDiscount"] = "0";
    // payloadFlightData["seatType"] = payloadDirectionData["seatType"];
    // payloadFlightData["seatPref"] = payloadDirectionData["seatPref"];
    payloadFlightData["seatType"] = "None";
    payloadFlightData["seatPref"] = "Coach";
    payloadFlightData["reserveFlights.x"] = 76;
    payloadFlightData["reserveFlights.y"] = 6;
}

function checkPaymentDetails() {
    const headers = {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': cookie
        }
    };
    const paymentDetailsResult = http.post(`${BASE_URL}/reservations.pl`, payloadFlightData, headers);
    check(
        paymentDetailsResult,
        {
            'Payment reservation data | status_code is 200': (res) => res.status === 200,
        }
    );
    const doc = paymentDetailsResult.html();
    const currentYear = new Date().getFullYear();

    // Заполняем данные о платеже для POST-запроса
    // payloadPaymentData["firstName"] = doc.find('input[name=firstName]').val();
    // payloadPaymentData["lastName"] = doc.find('input[name=lastName]').val();
    // payloadPaymentData["address1"] = doc.find('input[name=address1]').val();
    // payloadPaymentData["address2"] = doc.find('input[name=address2]').val();
    // payloadPaymentData["pass1"] = doc.find('input[name=pass1]').val();
    payloadPaymentData["firstName"] = "Ilya";
    payloadPaymentData["lastName"] = "Chukov";
    payloadPaymentData["address1"] = "Moscow";
    payloadPaymentData["address2"] = "Moscow";
    payloadPaymentData["pass1"] = "Ilya Chukov";
    payloadPaymentData["creditCard"] = creditCard;
    payloadPaymentData["expDate"] = "11/30";
    // payloadPaymentData["oldCCOption"] = doc.find('input[name=oldCCOption]').val();
    // payloadPaymentData["numPassengers"] = payloadFlightData["numPassengers"];
    // payloadPaymentData["seatType"] = payloadFlightData["seatType"];
    // payloadPaymentData["seatPref"] = payloadFlightData["seatPref"];
    // payloadPaymentData["outboundFlight"] = payloadFlightData["outboundFlight"];
    // payloadPaymentData["advanceDiscount"] = payloadFlightData["advanceDiscount"];
    // payloadPaymentData["returnFlight"] = doc.find('input[name=returnFlight]').val();
    // payloadPaymentData["JSFormSubmit"] = doc.find('input[name=JSFormSubmit]').val();
    payloadPaymentData["oldCCOption"] = "112";
    payloadPaymentData["numPassengers"] = "1";
    payloadPaymentData["seatType"] = "None";
    payloadPaymentData["seatPref"] = "Coach";
    payloadPaymentData["outboundFlight"] = randomFlight;
    payloadPaymentData["advanceDiscount"] = "0";
    // payloadPaymentData["returnFlight"] = doc.find('input[name=returnFlight]').val();
    // payloadPaymentData["JSFormSubmit"] = doc.find('input[name=JSFormSubmit]').val();
    payloadPaymentData["buyFlights.x"] = 76;
    payloadPaymentData["buyFlights.y"] = 6;
}

function buyTicket() {
    const headers = {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': cookie
        }
    };
    const buyTicketResult = http.post(`${BASE_URL}/reservations.pl`, payloadPaymentData, headers);
    check(
        buyTicketResult,
        {
            'Buy ticket request | status_code is 200': (res) => res.status === 200,
        }
    );
}

function openHomePage() {
    const headers = {
        headers: {
            'Cookie': cookie
        }
    };
    const openHomeResult = http.get(`${BASE_URL}/welcome.pl?page=menus`);
    check(
        openHomeResult,
        {
            'Open Home Page | status_code is 200': (res) => res.status === 200,
        }
    );

    const homeNavigationResult = http.get(`${BASE_URL}/nav.pl?page=menu&in=home`, headers);
    check(
        homeNavigationResult,
        {
            'Open Navigation Page | status_code is 200': (res) => res.status === 200,
        }
    );

    const loginGetResult = http.get(`${BASE_URL}/login.pl?intro=true`, headers);
    check(
        loginGetResult,
        {
            'Get Login Request | status_code is 200': (res) => res.status === 200,
        }
    );
}

export default function () {
    group('OpenHomePageAndLogin', () => {
        openWelcomePage();
        login();
    });
    group('ChooseDirectionAndFindFlight', () => {
        chooseDirection();
        findFlight();
    });
    group('BuyTicketAndReturnToHomePage', () => {
        checkPaymentDetails();
        buyTicket();
        openHomePage();
    });
}

export function teardown() {
    cookie = ""
    sessionValue = "";
    departureCity = "";
    arrivalCity = "";
    payloadDirectionData = {}
    payloadFlightData = {}
    payloadPaymentData = {}
}
