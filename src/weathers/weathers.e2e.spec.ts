import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../app.module';
import { WeathersService } from './weathers.service';
import { PROVINCE_NAMES_SHORT } from '../constants/districts.constants';
import { DistrictsService } from '../districts/districts.service';

describe('WeathersService', () => {
  jest.setTimeout(30000);
  let app: INestApplication;
  let service, districtsService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    service = moduleRef.get<WeathersService>(WeathersService);
    app = moduleRef.createNestApplication();
    districtsService = moduleRef.get<DistrictsService>(DistrictsService);

    await app.init();
  });

  describe('WeathersService', () => {
    const dtos = [];
    it('get realtime air polution info', async () => {
      return;
      const promises = PROVINCE_NAMES_SHORT.map(async (provinceName) => {
        return await service.getRealtimeAirPolutionInfoByProvinceName(
          provinceName,
        );
      });
      const results = await Promise.all(promises);
      results.flat().forEach((result) => {
        expect(result.cityName).toBeDefined();
        expect(result.measuredAt).toBeDefined();
        expect(result.o3Value).toBeDefined();
        expect(result.pm10Value).toBeDefined();
        expect(result.pm25Value).toBeDefined();
        expect(result.provinceName).toBeDefined();
      });
      dtos.push(...results.flat());
    });
    // it('create weather info', async () => {
    //   const promises = dtos.map(async (dto) => {
    //     return await service.upsertAirPolutionInfo(dto);
    //   });
    //   const result = await Promise.all(promises);
    //   expect(result.every((r) => r)).toBeTruthy();
    // });
    it('', async () => {
      const result = await service.createWeatherInfo();
      // console.log(result);
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
