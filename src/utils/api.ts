import type {RequestUrlParam, RequestUrlResponse} from 'obsidian';
import {requestUrl} from 'obsidian';

type RequestParams = Omit<RequestUrlParam, 'method' | 'headers'>;

type API = {
  get: (
    url: string,
    requestParams?: RequestParams,
  ) => Promise<RequestUrlResponse>;
  post: (
    url: string,
    requestParams?: RequestParams,
  ) => Promise<RequestUrlResponse>;
};

export function getAPI(accessToken: string, customServerURL?: string): API {
  const baseURL =
    customServerURL != null && customServerURL !== ''
      ? customServerURL
      : process.env.API_URL;
  function requestFactory(method: 'get' | 'post') {
    return async (url: string, requestParams?: RequestParams) => {
      return await requestUrl({
        url: `${baseURL}${url}`,
        method,
        headers: {'X-Api-Token': accessToken},
        ...requestParams,
      });
    };
  }

  return {
    get: requestFactory('get'),
    post: requestFactory('post'),
  };
}
