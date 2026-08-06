import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('summary')
  @Permissions('dashboard.view')
  summary(@CurrentUser() user: AuthenticatedUser, @Query('branchId') branchId?: string) {
    return this.service.getSummary(user.companyId!, user.userId, branchId);
  }

  @Get('charts/sales')
  @Permissions('dashboard.view')
  salesChart(@CurrentUser('companyId') companyId: string, @Query('days') days?: string) {
    return this.service.getSalesChart(companyId, days ? Number(days) : undefined);
  }

  @Get('charts/purchases')
  @Permissions('dashboard.view')
  purchaseChart(@CurrentUser('companyId') companyId: string, @Query('days') days?: string) {
    return this.service.getPurchaseChart(companyId, days ? Number(days) : undefined);
  }

  @Get('top-selling-products')
  @Permissions('dashboard.view')
  topSellingProducts(@CurrentUser('companyId') companyId: string, @Query('limit') limit?: string) {
    return this.service.getTopSellingProducts(companyId, limit ? Number(limit) : undefined);
  }

  @Get('expired-products')
  @Permissions('dashboard.view')
  expiredProducts(@CurrentUser('companyId') companyId: string) {
    return this.service.getExpiredProducts(companyId);
  }

  @Get('recent-transactions')
  @Permissions('dashboard.view')
  recentTransactions(@CurrentUser('companyId') companyId: string, @Query('limit') limit?: string) {
    return this.service.getRecentTransactions(companyId, limit ? Number(limit) : undefined);
  }

  @Get('cash-ledger')
  @Permissions('dashboard.view')
  cashLedger(
    @CurrentUser() user: AuthenticatedUser,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.service.getCashLedger(user.companyId!, user.userId, dateFrom, dateTo);
  }
}
