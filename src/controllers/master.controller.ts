import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';

export async function getCategories(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
    });
    res.status(200).json({ success: true, data: categories });
  } catch (error) {
    next(error);
  }
}

export async function getStorageLocations(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const locations = await prisma.storageLocation.findMany({
      where: { is_active: true },
      orderBy: { name: 'asc' },
    });
    res.status(200).json({ success: true, data: locations });
  } catch (error) {
    next(error);
  }
}

export async function getPublicStats(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const [totalFound, completedFound, totalLost, completedClaims] = await Promise.all([
      prisma.foundItem.count({ where: { status: { in: ['active', 'completed'] } } }),
      prisma.foundItem.count({ where: { status: 'completed' } }),
      prisma.lostReport.count({ where: { status: 'active' } }),
      prisma.claim.count({ where: { status: 'handed_over' } }),
    ]);

    const returnRate = totalFound > 0 ? ((completedFound / totalFound) * 100).toFixed(1) : '0';

    res.status(200).json({
      success: true,
      data: {
        totalFound,
        totalLost,
        completedClaims,
        returnRate: `${returnRate}%`,
      },
    });
  } catch (error) {
    next(error);
  }
}
