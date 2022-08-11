declare module 'myanimelist-api' {
    type GenericParameters = {
        [key: string]: any;
    }

    export interface ResponseWrapper<T> {
        status: number;
        statusText: string;
        data: T;
    }

    export interface ListResponse<T> {
        data: Array<T>;
        paging: Paging;
    }

    export type Paging = {
        next?: string;
    };

    export interface ClientOptions {
        clientId: string;
        clientSecret: string;
        accessToken?: string;
        refreshToken?: string;
        timeout?: number;
        axiosConfig?: GenericParameters;
    }

    export type ListStatus = "watching" | "completed" | "on_hold" | "dropped" | "plan_to_watch";
    export type ListSort = "list_score" | "list_updated_at" | "anime_title" | "anime_start_date" | "anime_id";

    export interface UserListAnimeParameters {
        status?: ListStatus;
        sort?: ListSort;
        limit?: number;
        offset?: number;
        fields?: string;
    }

    export interface UserListAnimeEntry {
        node: {
            id: number,
            main_picture: {
                large: string,
                medium: string,
            },
            title: string,
        },
        list_status?: {
            is_rewatching: boolean,
            num_episodes_watched: number,
            score: number,
            status: ListStatus,
            updated_at: string,
        }
    }

    export default class MyAnimeList {
        constructor(options: ClientOptions)

        user: {
            listAnime: (username: string, parameters: UserListAnimeParameters) => ResponseWrapper<ListResponse<UserListAnimeEntry>>;
        }
    }
}