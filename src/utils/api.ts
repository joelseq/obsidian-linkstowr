import axios from 'axios';

export function getAPI(accessToken: string) {
  return axios.create({
    baseURL: process.env.API_URL,
    timeout: 10000,
    headers: {'X-Api-Token': accessToken},
  });
}
