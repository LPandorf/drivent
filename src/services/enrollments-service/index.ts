import { Address, Enrollment } from '@prisma/client';
import { request } from '@/utils/request';
import { invalidCepError, invalidDataError, notFoundError } from '@/errors';
import addressRepository, { CreateAddressParams } from '@/repositories/address-repository';
import enrollmentRepository, { CreateEnrollmentParams } from '@/repositories/enrollment-repository';
import { exclude } from '@/utils/prisma-utils';

async function getAddressFromCEP(cep: string) {
  const result = await request.get(`${process.env.VIA_CEP_API}/${cep}/json/`);

  if (!result.data) {
    throw notFoundError();
  }

  if (result.status === 400) {
    throw invalidDataError([result.statusText]);
  }
  if (result.data.erro) {
    throw invalidCepError;
  }

  //const { bairro, uf, localidade, complemento, logradouro } = result.data;

  type Address = {
    logradouro: string;
    complemento: string;
    bairro: string;
    localidade: string;
    uf: string;
  };

  const object = async (params: Address) => {
    return {
      logradouro: params.logradouro || '',
      complemento: params.complemento || '',
      bairro: params.bairro || '',
      cidade: params.localidade || '',
      uf: params.uf || '',
    };
  };

  const response = await object(result.data);

  return response;
}

async function getOneWithAddressByUserId(userId: number): Promise<GetOneWithAddressByUserIdResult> {
  const enrollmentWithAddress = await enrollmentRepository.findWithAddressByUserId(userId);

  if (!enrollmentWithAddress) throw notFoundError();

  const [firstAddress] = enrollmentWithAddress.Address;
  const address = getFirstAddress(firstAddress);

  return {
    ...exclude(enrollmentWithAddress, 'userId', 'createdAt', 'updatedAt', 'Address'),
    ...(!!address && { address }),
  };
}

type GetOneWithAddressByUserIdResult = Omit<Enrollment, 'userId' | 'createdAt' | 'updatedAt'>;

function getFirstAddress(firstAddress: Address): GetAddressResult {
  if (!firstAddress) return null;

  return exclude(firstAddress, 'createdAt', 'updatedAt', 'enrollmentId');
}

type GetAddressResult = Omit<Address, 'createdAt' | 'updatedAt' | 'enrollmentId'>;

async function createOrUpdateEnrollmentWithAddress(params: CreateOrUpdateEnrollmentWithAddress) {
  const enrollment = exclude(params, 'address');
  const address = getAddressForUpsert(params.address);
  const cep = address.cep.replace('-', '');

  try {
    await getAddressFromCEP(cep);
  } catch {
    throw invalidDataError(['invalid CEP']);
  }

  const newEnrollment = await enrollmentRepository.upsert(params.userId, enrollment, exclude(enrollment, 'userId'));

  await addressRepository.upsert(newEnrollment.id, address, address);
}

function getAddressForUpsert(address: CreateAddressParams) {
  return {
    ...address,
    ...(address?.addressDetail && { addressDetail: address.addressDetail }),
  };
}

export type CreateOrUpdateEnrollmentWithAddress = CreateEnrollmentParams & {
  address: CreateAddressParams;
};

const enrollmentsService = {
  getOneWithAddressByUserId,
  createOrUpdateEnrollmentWithAddress,
  getAddressFromCEP,
};

export default enrollmentsService;
