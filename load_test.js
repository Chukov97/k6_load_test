import http from 'k6/http';
import { check, sleep } from 'k6';

const YANDEX_URL = 'http://ya.ru';
const WWW_URL = 'http://www.ru';

export const options = {
    scenarios: {
        ya_ru_scenario: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '5m', target: 60 },
                { duration: '10m', target: 60 },
                { duration: '5m', target: 72 },
                { duration: '10m', target: 72 },
            ],
            exec: 'yaRuRequest',
        },

        www_ru_scenario: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '5m', target: 120 },
                { duration: '10m', target: 120 },
                { duration: '5m', target: 144 },
                { duration: '10m', target: 144 },
            ],
            exec: 'wwwRuRequest',
        },
    },
    thresholds: {
        http_req_duration: ['p(95)<3000'],
        http_req_failed: ['rate<0.1'],
    },
};


export function yaRuRequest() {
    const response = http.get(`${YANDEX_URL}`);

    check(response, {
        'ya.ru status is 200': (r) => r.status === 200,
        'ya.ru response time OK': (r) => r.timings.duration < 5000,
    });

}

export function wwwRuRequest() {
    const response = http.get(`${WWW_URL}`);

    check(response, {
        'www.ru status is 200': (r) => r.status === 200,
        'www.ru response time OK': (r) => r.timings.duration < 5000,
    });

}
