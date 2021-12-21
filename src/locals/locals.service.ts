import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull, getRepository } from 'typeorm';
import { Weather } from '../weathers/entities/weather.entity';
import axios from 'axios';
import { VISIT_KOREA_AREA_CODE_URL } from '../constants/public_data.constants';
import { FileEntity } from '../file.entity';
import { Local } from './entites/local.entity';
import { Place } from './entites/place.entity';
import { UpdatePlaceDto } from './dto/update-place.dto';
import { CreatePlaceDto } from './dto/create-place.dto';
import {
  LOCAL_NOT_FOUND_MESSAGE,
  PLACE_NOT_FOUND_MESSAGE,
  PROVINCE_LIST_FOR_VISIT_KOREA,
  VISIT_KOREA_URL_FOR_IMAGE,
} from '../constants/locals.constants';

@Injectable()
export class LocalsService {
  constructor(
    @InjectRepository(Weather)
    private readonly weatherRepo: Repository<Weather>,
    @InjectRepository(FileEntity)
    private readonly fileRepo: Repository<FileEntity>,
    @InjectRepository(Local)
    private readonly localRepo: Repository<Local>,
    @InjectRepository(Place)
    private readonly placeRepo: Repository<Place>,
  ) {}
  async getLocalRankingByCity(
    option: LocalRankingOption,
  ): Promise<LocalRankingResult[]> {
    const { take } = option;
    const cities = await this.localRepo.find({
      where: { townCode: IsNull(), cityCode: Not(IsNull()) },
      relations: ['files'],
      take: take || 9,
    });
    console.log('LocalsService -> cities', cities);

    const localRankingResults = await this.addWeatherToLocalRankingResult(
      cities,
    );

    return localRankingResults;
  }
  private async addWeatherToLocalRankingResult(
    cities: Local[],
  ): Promise<LocalRankingResult[]> {
    const results = cities.map(async (city) => {
      const weather = await this.weatherRepo.findOne({
        where: { cityName: city.cityName },
      });
      return { ...city, ...weather };
    });
    return await Promise.all(results);
  }

  async getLocalImagesFromVisitKorea(
    cityName: string,
  ): Promise<{ title: string; url: string }[]> {
    const local = await this.getLocalByCityName(cityName);
    const [matchingProvince] = PROVINCE_LIST_FOR_VISIT_KOREA.filter(
      (province) => this.format4District(province.name) === local.provinceName,
    );

    const sigunguCodes = await this.getAreaCodesFromVisitKorea(
      matchingProvince.code,
    );
    const promises = sigunguCodes.map(async (sigungu) => {
      const params = this.getVisitKoreaImageParams({
        areaCode: matchingProvince.code,
        sigunguCode: sigungu.code,
      });

      const result = await axios.get(VISIT_KOREA_URL_FOR_IMAGE, { params });
      const totalCount = result.data.response.body.totalCount;
      if (!totalCount) return [];
      const innerImages = result.data.response.body.items.item;
      return innerImages;
    });
    const images = await Promise.all(promises);

    return images.map((i) => {
      return { title: i.title, url: i.firstimage };
    });
  }
  private getVisitKoreaImageParams(matchingProvince: {
    areaCode: number;
    sigunguCode: number;
  }) {
    const { areaCode, sigunguCode } = matchingProvince;
    return {
      ServiceKey:
        'sqcYoxiPGJmWv+7+X1pPjExvgKbD5IhInUB7bJCtIQZ881DodxmENiH4r2FUHjL0F4cpDreKpxVIO/AeycV8Dw==',
      pageNo: 1,
      numOfRows: 10,
      MobileOS: 'IOS',
      MobileApp: 'hobos-local2',
      areaCode,
      arrange: 'Q',
      listYN: 'Y',
      sigunguCode,
    };
  }

  async getAreaCodesFromVisitKorea(
    areaCode?: number,
  ): Promise<{ code: number; name: string }[]> {
    const params = this.getParams4areaCode(areaCode);
    const { data } = await axios.get(VISIT_KOREA_AREA_CODE_URL, {
      params,
    });
    const areaInfo = data.response.body.items.item;
    // TODO exception
    if (!areaInfo.length) return [{ code: -1, name: 'not found' }];

    return areaInfo;
  }

  private getParams4areaCode(areaCode?: number) {
    const ServiceKey =
      'sqcYoxiPGJmWv+7+X1pPjExvgKbD5IhInUB7bJCtIQZ881DodxmENiH4r2FUHjL0F4cpDreKpxVIO/AeycV8Dw==';

    const numOfRows = '100';
    const MobileOS = 'IOS';
    const MobileApp = 'hobos-local2';
    return { ServiceKey, numOfRows, MobileOS, MobileApp, areaCode };
  }

  async createImage4Local() {
    try {
      const areaCodes = await this.getAreaCodes();
      const locals = await this.addImagesToLocal(areaCodes.flat());

      return locals;
    } catch (error) {
      console.log('createImage4Local -> error', error);
    }
  }
  private async getAreaCodes() {
    const areaCodes = PROVINCE_LIST_FOR_VISIT_KOREA.map(
      async (province) => await this.getAreaCodesFromVisitKorea(province.code),
    );
    return await Promise.all(areaCodes);
  }

  private async addImagesToLocal(areaCodes: { code: number; name: string }[]) {
    const locals = areaCodes.flat().map(async (city) => {
      const local = await this.getLocalByCityName(city.name);
      // // TODO exception 청원군 마산시 진해시 북제주군 남제주군
      if (local) {
        const formattedCityName = this.format4District(city.name);
        const image = await this.getLocalImagesFromVisitKorea(
          formattedCityName,
        );

        const files = await this.fileRepo.save(image);
        local.files = files;

        await this.localRepo.save(local);

        return local;
      }
    });
    return await Promise.all(locals);
  }

  private format4District(provinceName: string) {
    if (provinceName === '서울') return '서울특별시';
    if (provinceName === '인천') return '인천광역시';
    if (provinceName === '대전') return '대전광역시';
    if (provinceName === '대구') return '대구광역시';
    if (provinceName === '광주') return '광주광역시';
    if (provinceName === '부산') return '부산광역시';
    if (provinceName === '울산') return '울산광역시';
    if (provinceName === '제주도') return '제주특별자치도';
    return provinceName;
  }
  async createLocalData(data: LocalType[]) {
    const local = await this.localRepo.create(data);

    await this.localRepo.save(local);

    return local;
  }
  async getCityList() {
    return await this.localRepo.find({ where: { townCode: IsNull() } });
  }
  async getCityNamesByProvinceName(name: string) {
    const provinceName = this.formatProvinceNameLong(name);
    return await getRepository(Local)
      .createQueryBuilder('Local')
      .select('city_name AS cityName')
      .addSelect('province_name AS provinceName')
      .where('province_name = :provinceName', { provinceName })
      .andWhere('city_name IS NOT NULL')
      .andWhere('province_name IS NOT NULL')
      .groupBy('city_name')
      .getRawMany();
  }
  async getLocalDetail(cityCode: number) {
    const local = await this.localRepo.findOne({
      where: { cityCode },
      relations: ['reviews'],
    });
    return local;
  }

  async getLocalByProvinceName(provinceName: string) {
    return await this.localRepo.findOne({ where: { provinceName } });
  }
  async getLocalByCityName(originalCityName: string) {
    const isSejong = originalCityName === '세종시';
    const cityName = isSejong ? '세종특별자치시' : originalCityName;
    return await this.localRepo.findOne({
      where: { cityName, townCode: IsNull() },
    });
  }
  async getLocalByCityCode(cityCode: string) {
    return await this.localRepo.findOne({ cityCode });
  }
  private formatProvinceNameLong(name) {
    if (name === '서울') return '서울특별시';
    if (name === '부산') return '부산광역시';
    if (name === '인천') return '인천광역시';
    if (name === '대구') return '대구광역시';
    if (name === '광주') return '광주광역시';
    if (name === '대전') return '대전광역시';
    if (name === '울산') return '울산광역시';
    if (name === '세종') return '세종특별자치시';
    if (name === '경기') return '경기도';
    if (name === '강원') return '강원도';
    if (name === '충북') return '충청북도';
    if (name === '충남') return '충청남도';
    if (name === '전북') return '전라북도';
    if (name === '전남') return '전라남도';
    if (name === '경북') return '경상북도';
    if (name === '경남') return '경상남도';
    if (name === '제주') return '제주특별자치도';
  }
  async createPlace(place: CreatePlaceDto) {
    const cityName = place.address.split(' ')[1];
    const local = await this.getLocalByCityName(cityName);

    if (!local) throw new NotFoundException(LOCAL_NOT_FOUND_MESSAGE);

    return await this.placeRepo.save({ ...place, local });
  }
  async updatePlace(dto: UpdatePlaceDto) {
    const { id, description } = dto;
    const place = await this.placeRepo.findOne(id);

    if (!place) throw new NotFoundException(PLACE_NOT_FOUND_MESSAGE);

    return await this.placeRepo.save({ ...place, description });
  }
}
type LocalRankingOption = {
  take: number;
};
type LocalRankingResult = Local & {
  o3Value: number;
  pm10Value: number;
  pm25Value: number;
  description: string;
  temp: number;
  feelsLike: number;
  humidity: number;
  // images: FileEntity[];
};
type LocalType = {
  provinceCode: string;
  province: string;
  cityCode: string;
  cityName: string;
  townCode: string;
  townName: string;
};
