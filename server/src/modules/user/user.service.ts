import { BaseService } from '../../core/base.service';
import { User } from '../../../../shared/types/user';
import { userRepository } from './user.repository';

class UserService extends BaseService<User> {
  constructor() {
    super(userRepository);
  }

  async createUser(data: any) {
    return userRepository.createUser(data);
  }

  async updateUser(userId: string, data: any) {
    return userRepository.updateUser(userId, data);
  }

  async getRoleGroups() {
    return userRepository.getRoleGroups();
  }
}

export const userService = new UserService();
